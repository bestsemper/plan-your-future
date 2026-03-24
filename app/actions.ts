'use server';

import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import fs from 'fs';
import path from 'path';
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

const prisma = new PrismaClient();
const DEFAULT_PLAN_START_YEAR = 2025;
const FORUM_VIEW_WINDOW_MS = 15 * 60 * 1000;
const FORUM_VIEWER_COOKIE = 'forumViewerId';

const forumPostDetailInclude = {
  votes: {
    select: {
      value: true,
      userId: true,
    },
  },
  attachedPlan: {
    select: {
      id: true,
      title: true,
    },
  },
  author: {
    select: {
      id: true,
      displayName: true,
      computingId: true,
    },
  },
  answers: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      author: {
        select: {
          id: true,
          displayName: true,
          computingId: true,
        },
      },
      votes: {
        select: {
          value: true,
          userId: true,
        },
      },
    },
  },
};

type ParsedStellicCourse = {
  courseCode: string;
  termName: 'Fall' | 'Winter' | 'Spring' | 'Summer' | null;
  year: number | null;
  status: 'taken' | 'planned';
  credits: number | null;
};

type ParsedAuditCompletedCourse = {
  courseCode: string;
  title: string | null;
  semesterTaken: string | null;
  sourceType: 'audit_pdf_transfer' | 'audit_pdf_unmatched' | 'audit_pdf_taken';
};

type AuditImportSelection = 'transfer' | 'taken' | 'both';

type AttachedPlanViewData = {
  plan: {
    id: string;
    title: string;
    ownerDisplayName: string;
    semesters: Array<{
      id: string;
      termName: string;
      termOrder: number;
      year: number;
      courses: Array<{
        id: string;
        courseCode: string;
        creditsMin: number | null;
        creditsMax: number | null;
      }>;
    }>;
  };
};

function hasTransferEquivalentGrade(line: string): boolean {
  // In Stellic audit exports, TE/PT indicate transfer or test/placement-equivalent credit.
  return /(?:Fall|Winter|Spring|Summer)\s*'?(\d{2})\s*(?:TE|PT)\b/i.test(line) || /\b(?:TE|PT)\b/i.test(line);
}

function shouldIgnoreStellicCourseLine(line: string): boolean {
  return /\(courses:\s*\(|\bcredits in plan\b|\(through\b|\bremaining\b|\b\d{4}-level\s+elective\b/i.test(line);
}

function decodeAuditPdfText(pdfBase64: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const normalizedBase64 = pdfBase64.includes(',')
        ? pdfBase64.split(',').pop() ?? ''
        : pdfBase64;

      if (!normalizedBase64) {
        reject(new Error('Uploaded file payload was empty.'));
        return;
      }

      const pdfBuffer = Buffer.from(normalizedBase64, 'base64');
      if (pdfBuffer.length === 0) {
        reject(new Error('Uploaded PDF could not be decoded.'));
        return;
      }

      const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (dataBuffer: Buffer) => Promise<{ text?: string }>;
      const pdfData = await pdfParse(pdfBuffer);
      resolve(pdfData.text || '');
    } catch (error) {
      reject(error);
    }
  });
}

function parseAuditSemesterTaken(line: string): string | null {
  const termMatch = line.match(/\b(Fall|Winter|Spring|Summer)\s*'(\d{2})(?!\d)/i);
  if (!termMatch) return null;

  const term = termMatch[1][0].toUpperCase() + termMatch[1].slice(1).toLowerCase();
  const twoDigitYear = Number.parseInt(termMatch[2], 10);
  const fullYear = twoDigitYear <= 50 ? 2000 + twoDigitYear : 1900 + twoDigitYear;
  return `${term} ${fullYear}`;
}

function normalizeAuditPdfText(text: string): string {
  return text
    .replace(/\r/g, '')
    // Join words split across PDF line wraps, e.g. "Spri\nng".
    .replace(/([A-Za-z])\n\s*([a-z])/g, '$1$2')
    // Join semester/year tokens split across lines, e.g. "Fall\n'25A".
    .replace(/\b(Fall|Winter|Spring|Summer)\n\s*'(\d{2})/g, "$1 '$2")
    // Join common wrapped suffixes after a course/title line.
    .replace(/(\([^\n]*credits\)|\b(?:TE|PT|CR|A\+?|A-|B\+?|B-|C\+?|C-|D\+?|D-|F)\b)\n\s*(?=(?:Fall|Winter|Spring|Summer|'\d{2}|\d{2}-\d{2}-\d{4},))/g, '$1 ');
}

function extractAuditCompletedCoursesFromText(
  text: string,
  selection: AuditImportSelection = 'transfer'
): ParsedAuditCompletedCourse[] {
  const rawLines = normalizeAuditPdfText(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const resultMap = new Map<string, ParsedAuditCompletedCourse>();
  let inUnmatchedSection = false;

  for (const line of rawLines) {
    if (/^Unmatched Courses\b/i.test(line)) {
      inUnmatchedSection = true;
      continue;
    }

    if (inUnmatchedSection && /^\d{2}-\d{2}-\d{4},/.test(line)) {
      inUnmatchedSection = false;
      continue;
    }

    const isTransferLine = /Non-UVa Transfer\/Test Credit/i.test(line);
    const isTeTransferLine = hasTransferEquivalentGrade(line);
    const isUnmatched = inUnmatchedSection;
    const hasTakenKeyword = /\btaken\b/i.test(line);
    const hasPlannedOrProgressKeyword = /\bplanned\b|in progress|remaining/i.test(line);
    const explicitGradeMatch = line.match(/(?:Fall|Winter|Spring|Summer)\s*'?(\d{2})\s*([A-Z][A-Z+-]?)/i);
    const hasTakenLikeGrade = Boolean(explicitGradeMatch);

    const isTransfer = isTransferLine || isTeTransferLine;
    const isTaken = (hasTakenKeyword || hasTakenLikeGrade || isUnmatched) && !hasPlannedOrProgressKeyword;

    const includeForSelection =
      selection === 'both'
        ? isTransfer || isTaken || isUnmatched
        : selection === 'transfer'
          ? isTransfer || isUnmatched
          : (isTaken || isUnmatched) && !isTransfer;

    if (!includeForSelection) continue;

    const courseCodeMatch = line.match(/\b([A-Z]{2,4})\s?-?(\d{4}T?)\b(?!\s*-\s*Level\b)/);
    if (!courseCodeMatch) continue;

    const courseCode = `${courseCodeMatch[1]} ${courseCodeMatch[2]}`.toUpperCase();
    const titleSection = line.slice(courseCodeMatch.index! + courseCodeMatch[0].length).trim();
    const title = (titleSection.split(/\(\d+(?:\.\d+)?\s+credits\)/i)[0] || '').trim() || null;
    // TE/PT rows are transfer-equivalent credit and should not be tied to a taken semester.
    const semesterTaken = isTransfer ? null : parseAuditSemesterTaken(line);
    const nextSourceType: ParsedAuditCompletedCourse['sourceType'] = isTransfer
      ? 'audit_pdf_transfer'
      : isUnmatched
        ? 'audit_pdf_unmatched'
        : 'audit_pdf_taken';

    const existing = resultMap.get(courseCode);
    resultMap.set(courseCode, {
      courseCode,
      title: existing?.title ?? title,
      semesterTaken: existing?.semesterTaken ?? semesterTaken,
      sourceType:
        existing?.sourceType === 'audit_pdf_transfer' || nextSourceType === 'audit_pdf_transfer'
          ? 'audit_pdf_transfer'
          : existing?.sourceType === 'audit_pdf_unmatched' || nextSourceType === 'audit_pdf_unmatched'
            ? 'audit_pdf_unmatched'
            : 'audit_pdf_taken',
    });
  }

  return Array.from(resultMap.values());
}

function parseStellicCoursesFromText(text: string): ParsedStellicCourse[] {
  const lines = normalizeAuditPdfText(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const results: ParsedStellicCourse[] = [];
  const seen = new Set<string>();
  let currentTerm: ParsedStellicCourse['termName'] = null;
  let currentYear: number | null = null;

  // Stellic "Plan Report" semester header, e.g. "Fall 2025 - 16 credits attempted" or "Fall '25 - 16 credits attempted"
  const termHeaderRegex = /\b(Fall|Winter|Spring|Summer)\s+(?:'(\d{2})|(?:20(\d{2})))\s*-\s*\d+(?:\.\d+)?\s+credits\s+attempted/i;
  // Stellic "Plan Report" row, e.g. "CS 2120 ... 3A+Taken" or compact "... (001)3Planned" or "... 3-"
  const courseRowRegex = /^([A-Z]{2,4})\s?-?(\d{4}T?)\s+(.+?)\s*(\d+(?:\.\d+)?)([A-Z][A-Z+-]?|CR|NC|P|S|U|W)?(Taken|Planned|-)?$/i;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, ' ');

    const headerMatch = line.match(termHeaderRegex);
    if (headerMatch) {
      const termValue = headerMatch[1].toLowerCase();
      currentTerm =
        termValue === 'fall'
          ? 'Fall'
          : termValue === 'winter'
            ? 'Winter'
            : termValue === 'spring'
              ? 'Spring'
              : 'Summer';
      // Handle both '25 and 2025 formats
      const yearStr = headerMatch[2] || headerMatch[3];
      const yearNum = Number.parseInt(yearStr, 10);
      currentYear = yearNum < 100 ? 2000 + yearNum : yearNum;
      continue;
    }

    if (!currentTerm || !currentYear) continue;

    const rowMatch = line.match(courseRowRegex);
    if (!rowMatch) continue;

    const code = `${rowMatch[1]} ${rowMatch[2]}`.toUpperCase();
    if (/\b\d{4}T\b/i.test(code)) continue;

    const statusRaw = rowMatch[6]?.toLowerCase();
    const status = statusRaw === 'taken' ? 'taken' : 'planned';
    const parsedCredits = Number.parseFloat(rowMatch[4]);
    const credits = Number.isNaN(parsedCredits) ? null : Math.round(parsedCredits);

    const dedupeKey = `${code}|${currentTerm}|${currentYear}|${status}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    results.push({
      courseCode: code,
      termName: currentTerm,
      year: currentYear,
      status,
      credits,
    });
  }

  return results;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password: string, hash: string): boolean {
  if (!hash || !hash.includes(':')) return false;
  const [salt, key] = hash.split(':');
  try {
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = scryptSync(password, salt, 64);
    return timingSafeEqual(keyBuffer, derivedKey);
  } catch (error) {
    return false;
  }
}

// MOCK AUTH: In a real app, this would integrate with NetBadge/SSO
// For MVP, we'll just find or create a user by computingId
export async function mockLogin(computingId: string, password: string) {
  if (!computingId) return { error: "Computing ID is required" };
  if (!password) return { error: "Password is required" };

  let user = await prisma.user.findUnique({
    where: { computingId }
  });

  if (!user || !user.password) {
    return { error: "Incorrect login info." };
  }

  // Secure password verification
  if (!verifyPassword(password, user.password)) {
    return { error: "Incorrect login info." };
  }

  // Set session cookie mock here if needed
  const cookieStore = await cookies();
  cookieStore.set('computingId', user.computingId, { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production', 
    path: '/' 
  });
  
  return { success: true, user };
}

export async function mockSignUp(computingId: string, password: string, displayName?: string) {
  if (!computingId) return { error: "Computing ID is required" };
  if (!password) return { error: "Password is required" };

  let user = await prisma.user.findUnique({
    where: { computingId }
  });

  if (user) {
    return { error: "Account already exists. Please log in." };
  }

  const hashedPassword = hashPassword(password);

  user = await prisma.user.create({
    data: {
      computingId,
      displayName: displayName || computingId,
      password: hashedPassword,
      major: 'Undeclared'
    }
  });

  // Create an empty goal profile
  await prisma.goalProfile.create({
    data: { userId: user.id }
  });

  // Set session cookie mock here if needed
  const cookieStore = await cookies();
  cookieStore.set('computingId', user.computingId, { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production', 
    path: '/' 
  });
  
  return { success: true, user };
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const computingId = cookieStore.get('computingId')?.value;
  
  if (!computingId) return null;
  
  const user = await prisma.user.findUnique({
    where: { computingId }
  });

  if (user && !user.additionalPrograms) {
    user.additionalPrograms = [];
  }

  return user;
}

export async function updateCurrentUserProfile(data: {
  displayName: string;
  school?: string;
  major?: string;
  additionalPrograms?: string;
  currentAcademicYear?: string;
  gradYear?: string;
  bio?: string;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Not authenticated.' };
  }

  const displayName = data.displayName?.trim();
  if (!displayName) {
    return { error: 'Display name is required.' };
  }

  const school = data.school?.trim() || null;
  const major = data.major?.trim() || null;
  const bio = data.bio?.trim() || null;
  const additionalPrograms = (data.additionalPrograms ?? '')
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  let currentAcademicYear: number | null = null;
  if (data.currentAcademicYear && data.currentAcademicYear.trim() !== '') {
    const parsed = Number.parseInt(data.currentAcademicYear, 10);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 10) {
      return { error: 'Current academic year must be between 1 and 10.' };
    }
    currentAcademicYear = parsed;
  }

  let gradYear: number | null = null;
  if (data.gradYear && data.gradYear.trim() !== '') {
    const parsed = Number.parseInt(data.gradYear, 10);
    const currentYear = new Date().getFullYear();
    if (Number.isNaN(parsed) || parsed < currentYear - 2 || parsed > currentYear + 12) {
      return { error: 'Graduation year must be within a reasonable range.' };
    }
    gradYear = parsed;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      displayName,
      school,
      major,
      additionalPrograms,
      currentAcademicYear,
      gradYear,
      bio,
    },
  });

  revalidatePath('/profile');
  revalidatePath('/');

  return { success: true };
}

import { redirect } from 'next/navigation';

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete('computingId');
  redirect('/login');
}

export async function createForumPost(title: string, body: string, attachedPlanId?: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'You must be logged in to post.' };
  }

  const trimmedTitle = title?.trim();
  const trimmedBody = body?.trim();

  if (!trimmedTitle) {
    return { error: 'Post title is required.' };
  }
  if (!trimmedBody) {
    return { error: 'Post body is required.' };
  }

  let validatedPlanId: string | null = null;
  let planSnapshot: any = null;
  
  if (attachedPlanId && attachedPlanId.trim() !== '') {
    const plan = await prisma.plan.findFirst({
      where: {
        id: attachedPlanId,
        userId: user.id,
      },
      select: {
        id: true,
        title: true,
        semesters: {
          orderBy: { termOrder: 'asc' },
          select: {
            id: true,
            termName: true,
            termOrder: true,
            year: true,
            courses: {
              orderBy: { courseCode: 'asc' },
              select: {
                id: true,
                courseCode: true,
                creditsMin: true,
                creditsMax: true,
              },
            },
          },
        },
      },
    });

    if (!plan) {
      return { error: 'Selected plan does not exist.' };
    }

    validatedPlanId = plan.id;
    // Capture a snapshot of the plan at the time of posting
    planSnapshot = {
      title: plan.title,
      semesters: plan.semesters,
    };
  }

  const post = await prisma.forumPost.create({
    data: {
      authorId: user.id,
      title: trimmedTitle,
      body: trimmedBody,
      attachedPlanId: validatedPlanId,
      planSnapshot: planSnapshot,
    },
  });

  // Automatically upvote the post as the author
  await prisma.vote.create({
    data: {
      userId: user.id,
      postId: post.id,
      value: 1,
    },
  });

  revalidatePath('/forum');
  revalidatePath('/forum/questions');
  revalidatePath(`/forum/${post.postNumber}`);
  return { success: true, postNumber: post.postNumber, title: post.title };
}

export async function deleteForumPost(postId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'You must be logged in to delete posts.' };
  }

  const post = await prisma.forumPost.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true },
  });

  if (!post) {
    return { error: 'Post not found.' };
  }

  if (post.authorId !== user.id) {
    return { error: 'You can only delete your own posts.' };
  }

  await prisma.forumPost.delete({
    where: { id: post.id },
  });

  revalidatePath('/forum');
  return { success: true };
}

export async function addForumReply(postId: string, body: string, parentReplyId?: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'You must be logged in to reply.' };
  }

  const trimmedBody = body?.trim();
  if (!trimmedBody) {
    return { error: 'Reply cannot be empty.' };
  }

  let validatedParentReplyId: string | null = null;
  if (parentReplyId && parentReplyId.trim() !== '') {
    const parentReply = await prisma.forumAnswer.findUnique({
      where: { id: parentReplyId },
      select: { id: true, postId: true },
    });

    if (!parentReply || parentReply.postId !== postId) {
      return { error: 'Invalid parent reply.' };
    }

    validatedParentReplyId = parentReply.id;
  }

  const createdAnswer = await prisma.forumAnswer.create({
    data: {
      postId,
      authorId: user.id,
      parentId: validatedParentReplyId,
      body: trimmedBody,
    },
  });

  // Automatically upvote the user's own comment
  await prisma.vote.create({
    data: {
      userId: user.id,
      answerId: createdAnswer.id,
      value: 1,
    },
  });

  revalidatePath('/forum');
  return { success: true };
}

export async function deleteForumReply(answerId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'You must be logged in to delete replies.' };
  }

  const answer = await prisma.forumAnswer.findUnique({
    where: { id: answerId },
    select: { id: true, authorId: true, deletedAt: true },
  });

  if (!answer) {
    return { error: 'Reply not found.' };
  }

  if (answer.authorId !== user.id) {
    return { error: 'You can only delete your own replies.' };
  }

  if (!answer.deletedAt) {
    await prisma.forumAnswer.update({
      where: { id: answer.id },
      data: {
        body: '',
        deletedAt: new Date(),
      },
    });
  }

  revalidatePath('/forum');
  return { success: true };
}

export async function voteOnForumReply(answerId: string, value: 1 | -1) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'You must be logged in to vote.' };
  }

  if (value !== 1 && value !== -1) {
    return { error: 'Invalid vote value.' };
  }

  const existingVote = await prisma.vote.findFirst({
    where: {
      userId: user.id,
      answerId,
    },
  });

  if (!existingVote) {
    await prisma.vote.create({
      data: {
        userId: user.id,
        answerId,
        value,
      },
    });
  } else if (existingVote.value === value) {
    // Clicking the same vote removes it (toggle off).
    await prisma.vote.delete({
      where: { id: existingVote.id },
    });
  } else {
    await prisma.vote.update({
      where: { id: existingVote.id },
      data: { value },
    });
  }

  revalidatePath('/forum');
  return { success: true };
}

export async function voteOnForumPost(postId: string, value: 1 | -1) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'You must be logged in to vote.' };
  }

  if (value !== 1 && value !== -1) {
    return { error: 'Invalid vote value.' };
  }

  const existingVote = await prisma.vote.findFirst({
    where: {
      userId: user.id,
      postId,
    },
  });

  if (!existingVote) {
    await prisma.vote.create({
      data: {
        userId: user.id,
        postId,
        value,
      },
    });
  } else if (existingVote.value === value) {
    await prisma.vote.delete({
      where: { id: existingVote.id },
    });
  } else {
    await prisma.vote.update({
      where: { id: existingVote.id },
      data: { value },
    });
  }

  revalidatePath('/forum');
  revalidatePath(`/forum/${postId}`);
  return { success: true };
}

export async function getForumPageData() {
  const currentUser = await getCurrentUser();

  const userPlans = currentUser
    ? await prisma.plan.findMany({
        where: { userId: currentUser.id },
        select: { id: true, title: true },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  const posts = await prisma.forumPost.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      votes: {
        select: {
          value: true,
          userId: true,
        },
      },
      attachedPlan: {
        select: {
          id: true,
          title: true,
        },
      },
      author: {
        select: {
          id: true,
          displayName: true,
          computingId: true,
        },
      },
      answers: {
        orderBy: { createdAt: 'asc' },
        include: {
          author: {
            select: {
              id: true,
              displayName: true,
              computingId: true,
            },
          },
          votes: {
            select: {
              value: true,
              userId: true,
            },
          },
        },
      },
    },
  });

  const normalizedPosts = posts.map((post) => ({
    currentUserPostVote: (() => {
      const userVote = post.votes.find((vote) => vote.userId === currentUser?.id)?.value;
      return userVote === 1 ? 1 : userVote === -1 ? -1 : 0;
    })() as 1 | -1 | 0,
    id: post.id,
    postNumber: post.postNumber,
    title: post.title,
    body: post.body,
    voteScore: post.votes.reduce((sum, vote) => sum + vote.value, 0),
    voteCount: post.votes.length,
    viewCount: post.viewCount,
    createdAt: post.createdAt.toISOString(),
    authorDisplayName: post.author.displayName,
    authorId: post.author.id,
    authorComputingId: post.author.computingId,
    canDelete: currentUser?.id === post.authorId,
    attachedPlan: post.attachedPlan,
    answers: post.answers.map((answer) => {
      const userVote = answer.votes.find((vote) => vote.userId === currentUser?.id)?.value;
      const currentUserVote: 1 | -1 | 0 = userVote === 1 ? 1 : userVote === -1 ? -1 : 0;

      return {
        id: answer.id,
        parentId: answer.parentId,
        body: answer.body,
        isDeleted: Boolean(answer.deletedAt),
        canDelete: currentUser?.id === answer.authorId && !answer.deletedAt,
        createdAt: answer.createdAt.toISOString(),
        authorDisplayName: answer.author.displayName,
        authorId: answer.author.id,
        authorComputingId: answer.author.computingId,
        voteScore: answer.votes.reduce((sum, vote) => sum + vote.value, 0),
        currentUserVote,
      };
    }),
  }));

  return {
    posts: normalizedPosts,
    plans: userPlans,
    canPost: Boolean(currentUser),
  };
}

export async function getForumPostPageData(postNumber: number) {
  const currentUser = await getCurrentUser();
  const cookieStore = await cookies();

  const userPlans = currentUser
    ? await prisma.plan.findMany({
        where: { userId: currentUser.id },
        select: { id: true, title: true },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  const existingPost = await prisma.forumPost.findFirst({
    where: { postNumber },
    select: { id: true },
  });

  if (!existingPost) {
    return { error: 'not_found' as const };
  }

  let viewerToken: string | null = null;
  if (!currentUser) {
    viewerToken = cookieStore.get(FORUM_VIEWER_COOKIE)?.value ?? null;
    if (!viewerToken) {
      viewerToken = randomBytes(16).toString('hex');
      cookieStore.set(FORUM_VIEWER_COOKIE, viewerToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }

  const cutoff = new Date(Date.now() - FORUM_VIEW_WINDOW_MS);

  const existingView = currentUser
    ? await prisma.forumPostView.findUnique({
        where: {
          postId_userId: {
            postId: existingPost.id,
            userId: currentUser.id,
          },
        },
      })
    : viewerToken
      ? await prisma.forumPostView.findUnique({
          where: {
            postId_viewerToken: {
              postId: existingPost.id,
              viewerToken,
            },
          },
        })
      : null;

  const shouldCountView = !existingView || existingView.lastViewedAt < cutoff;

  const post = shouldCountView
    ? await prisma.$transaction(async (tx) => {
        if (currentUser) {
          if (existingView) {
            await tx.forumPostView.update({
              where: {
                postId_userId: {
                  postId: existingPost.id,
                  userId: currentUser.id,
                },
              },
              data: { lastViewedAt: new Date() },
            });
          } else {
            await tx.forumPostView.create({
              data: {
                postId: existingPost.id,
                userId: currentUser.id,
                lastViewedAt: new Date(),
              },
            });
          }
        } else if (viewerToken) {
          if (existingView) {
            await tx.forumPostView.update({
              where: {
                postId_viewerToken: {
                  postId: existingPost.id,
                  viewerToken,
                },
              },
              data: { lastViewedAt: new Date() },
            });
          } else {
            await tx.forumPostView.create({
              data: {
                postId: existingPost.id,
                viewerToken,
                lastViewedAt: new Date(),
              },
            });
          }
        }

        return tx.forumPost.update({
          where: { id: existingPost.id },
          data: {
            viewCount: { increment: 1 },
          },
          include: forumPostDetailInclude,
        });
      })
    : await prisma.forumPost.findUniqueOrThrow({
        where: { id: existingPost.id },
        include: forumPostDetailInclude,
      });

  const postUserVote = post.votes.find((vote) => vote.userId === currentUser?.id)?.value;
  const currentUserPostVote: 1 | -1 | 0 = postUserVote === 1 ? 1 : postUserVote === -1 ? -1 : 0;

  const normalizedPost = {
    id: post.id,
    postNumber: post.postNumber,
    title: post.title,
    body: post.body,
    voteScore: post.votes.reduce((sum, vote) => sum + vote.value, 0),
    currentUserVote: currentUserPostVote,
    viewCount: post.viewCount,
    createdAt: post.createdAt.toISOString(),
    authorDisplayName: post.author.displayName,
    authorId: post.author.id,
    authorComputingId: post.author.computingId,
    canDelete: currentUser?.id === post.authorId,
    attachedPlan: post.attachedPlan,
    answers: post.answers.map((answer) => {
      const userVote = answer.votes.find((vote) => vote.userId === currentUser?.id)?.value;
      const currentUserVote: 1 | -1 | 0 = userVote === 1 ? 1 : userVote === -1 ? -1 : 0;

      return {
        id: answer.id,
        parentId: answer.parentId,
        body: answer.body,
        isDeleted: Boolean(answer.deletedAt),
        canDelete: currentUser?.id === answer.authorId && !answer.deletedAt,
        createdAt: answer.createdAt.toISOString(),
        authorDisplayName: answer.author.displayName,
        authorId: answer.author.id,
        authorComputingId: answer.author.computingId,
        voteScore: answer.votes.reduce((sum, vote) => sum + vote.value, 0),
        currentUserVote,
      };
    }),
  };

  return {
    post: normalizedPost,
    plans: userPlans,
    canPost: Boolean(currentUser),
  };
}

export async function createNewPlan(title?: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'You must be logged in to create a plan.' };
  }

  const existingCount = await prisma.plan.count({ where: { userId: user.id } });
  const planTitle = title?.trim() || `My Plan ${existingCount + 1}`;

  const plan = await prisma.plan.create({
    data: {
      userId: user.id,
      title: planTitle,
      isPublished: false,
    },
  });

  const baseYear = DEFAULT_PLAN_START_YEAR;
  for (let termOrder = 1; termOrder <= 8; termOrder++) {
    await prisma.semester.create({
      data: {
        planId: plan.id,
        termOrder,
        termName: termOrder % 2 === 1 ? 'Fall' : 'Spring',
        year: baseYear + Math.floor(termOrder / 2),
      },
    });
  }

  revalidatePath('/plan');
  revalidatePath('/forum');
  return { success: true, planId: plan.id };
}

export async function renamePlan(planId: string, title: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'You must be logged in to rename a plan.' };
  }

  const trimmedTitle = title?.trim();
  if (!trimmedTitle) {
    return { error: 'Plan name is required.' };
  }

  const plan = await prisma.plan.findFirst({
    where: {
      id: planId,
      userId: user.id,
    },
    select: { id: true },
  });

  if (!plan) {
    return { error: 'Plan not found.' };
  }

  await prisma.plan.update({
    where: { id: plan.id },
    data: { title: trimmedTitle },
  });

  revalidatePath('/plan');
  revalidatePath('/forum');
  return { success: true };
}

export async function deletePlan(planId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'You must be logged in to delete a plan.' };
  }

  const plan = await prisma.plan.findFirst({
    where: {
      id: planId,
      userId: user.id,
    },
    select: { id: true },
  });

  if (!plan) {
    return { error: 'Plan not found.' };
  }

  await prisma.forumPost.updateMany({
    where: { attachedPlanId: plan.id },
    data: { attachedPlanId: null },
  });

  await prisma.plan.delete({
    where: { id: plan.id },
  });

  revalidatePath('/plan');
  revalidatePath('/forum');
  return { success: true };
}

export async function getPlanBuilderData() {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'unauthenticated' };
  }

  const plans = await prisma.plan.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      semesters: {
        orderBy: { termOrder: 'asc' },
        select: {
          id: true,
          termName: true,
          termOrder: true,
          year: true,
          courses: {
            select: {
              id: true,
              courseCode: true,
              creditsMin: true,
              creditsMax: true,
            },
          },
        },
      },
    },
  });

  const allCourses = await getAllPossibleCoursesFromJSON();

  // Get completed courses for prerequisite checking
  const completedCourses = await prisma.completedCourse.findMany({
    where: { userId: user.id },
    select: { courseCode: true },
  });

  return {
    userId: user.id,
    plans,
    allCourses,
    completedCourses: completedCourses.map((c) => c.courseCode),
  };
}

export async function getAttachedPlanViewData(planId: string): Promise<AttachedPlanViewData | { error: 'not_found' | 'forbidden' }> {
  const currentUser = await getCurrentUser();

  // Check if this plan is attached to a forum post with a snapshot
  const attachedPost = await prisma.forumPost.findFirst({
    where: { attachedPlanId: planId },
    select: { 
      id: true,
      planSnapshot: true,
      author: {
        select: {
          displayName: true,
        },
      },
    },
  });

  // If there's a snapshot, use that instead of the live plan
  if (attachedPost?.planSnapshot) {
    const snapshot = attachedPost.planSnapshot as any;
    return {
      plan: {
        id: planId,
        title: snapshot.title,
        ownerDisplayName: attachedPost.author.displayName,
        semesters: snapshot.semesters,
      },
    };
  }

  const plan = await prisma.plan.findFirst({
    where: { id: planId },
    select: {
      id: true,
      title: true,
      userId: true,
      user: {
        select: {
          displayName: true,
        },
      },
      semesters: {
        orderBy: { termOrder: 'asc' },
        select: {
          id: true,
          termName: true,
          termOrder: true,
          year: true,
          courses: {
            orderBy: { courseCode: 'asc' },
            select: {
              id: true,
              courseCode: true,
              creditsMin: true,
              creditsMax: true,
            },
          },
        },
      },
    },
  });

  if (!plan) {
    return { error: 'not_found' as const };
  }

  const ownedByCurrentUser = currentUser?.id === plan.userId;
  let attachedToForumPost = false;

  if (!ownedByCurrentUser) {
    attachedToForumPost = Boolean(attachedPost?.id);
  }

  if (!ownedByCurrentUser && !attachedToForumPost) {
    return { error: 'forbidden' as const };
  }

  return {
    plan: {
      id: plan.id,
      title: plan.title,
      ownerDisplayName: plan.user.displayName,
      semesters: plan.semesters,
    },
  };
}

export async function generatePreliminaryPlan(userId: string, major: string, goals: string[]) {
  // 1. Fetch user's completed courses
  const completed = await prisma.completedCourse.findMany({
    where: { userId }
  });

  // 2. Fetch/Mock Major Requirements
  const mockMajorReqs = [
    { code: 'CS 1110', credits: 3 },
    { code: 'CS 2100', credits: 4 },
    { code: 'CS 2120', credits: 3 },
    { code: 'CS 2130', credits: 4 },
    { code: 'CS 3100', credits: 3 },
    { code: 'CS 3120', credits: 3 },
    { code: 'CS 3130', credits: 4 },
    { code: 'CS 3140', credits: 3 },
  ];

  // 3. Filter out completed
  const completedCodes = new Set(completed.map(c => c.courseCode));
  const remainingReqs = mockMajorReqs.filter(req => !completedCodes.has(req.code));

  // 4. Distribute into semesters (very basic mock logic)
  const plan = await prisma.plan.create({
    data: {
      userId,
      title: `${major} Auto-Generated Plan`,
      isPublished: false,
    }
  });

  let termOrder = 1;
  let currentYear = DEFAULT_PLAN_START_YEAR;

  // Simple chunking (2 courses per semester mock)
  for (let i = 0; i < remainingReqs.length; i += 2) {
    const chunk = remainingReqs.slice(i, i + 2);
    
    await prisma.semester.create({
      data: {
        planId: plan.id,
        termName: termOrder % 2 === 1 ? 'Fall' : 'Spring',
        termOrder: termOrder,
        year: termOrder % 2 === 1 ? currentYear : currentYear + 1,
        courses: {
          create: chunk.map(c => ({
            courseCode: c.code,
            creditsMin: c.credits,
            creditsMax: c.credits
          }))
        }
      }
    });

    if (termOrder % 2 === 0) currentYear++;
    termOrder++;
  }

  revalidatePath('/plan');
  return plan;
}

export async function addCourseToSemester(semesterId: string, courseCode: string, credits: number) {
  if (!courseCode || credits == null) throw new Error("Course details missing");
  const normalizedCourseCode = courseCode.toUpperCase().replace(/\s+/g, ' ').trim();

  const existing = await prisma.plannedCourse.findFirst({
    where: {
      semesterId,
      courseCode: normalizedCourseCode,
    },
    select: { id: true },
  });

  // Do not allow duplicate copies of the same course in one semester.
  if (existing) {
    return;
  }

  // Get the course's actual credit range from JSON
  const creditsInfo = await getCourseCreditsInfoFromJSON(normalizedCourseCode);
  const creditsMin = creditsInfo.creditsMin ?? credits;
  const creditsMax = creditsInfo.creditsMax ?? credits;

  await prisma.plannedCourse.create({
    data: {
      semesterId,
      courseCode: normalizedCourseCode,
      creditsMin,
      creditsMax,
    }
  });
  revalidatePath('/plan');
}

export async function updateCourseCreditValue(courseId: string, credits: number) {
  if (credits == null) throw new Error("Credits value missing");
  
  await prisma.plannedCourse.update({
    where: { id: courseId },
    data: {
      creditsMin: credits,
      creditsMax: credits,
    }
  });
  revalidatePath('/plan');
}

export async function removeDuplicateCoursesInSemester(semesterId: string, courseCode: string) {
  const normalizedCourseCode = courseCode.toUpperCase().replace(/\s+/g, ' ').trim();
  const duplicates = await prisma.plannedCourse.findMany({
    where: {
      semesterId,
      courseCode: normalizedCourseCode,
    },
    orderBy: {
      id: 'asc',
    },
    select: {
      id: true,
    },
  });

  if (duplicates.length <= 1) {
    return;
  }

  const idsToRemove = duplicates.slice(1).map((row) => row.id);
  await prisma.plannedCourse.deleteMany({
    where: {
      id: {
        in: idsToRemove,
      },
    },
  });

  revalidatePath('/plan');
}

export async function removeCourseFromSemester(courseId: string) {
  await prisma.plannedCourse.delete({
    where: { id: courseId }
  });
  revalidatePath('/plan');
}

export async function addSemesterToPlan(
  planId: string,
  schoolYearStart: number,
  termName: 'Fall' | 'Winter' | 'Spring' | 'Summer'
) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'You must be logged in to edit a plan.' };
  }

  const plan = await prisma.plan.findFirst({
    where: {
      id: planId,
      userId: user.id,
    },
    include: {
      semesters: {
        orderBy: { termOrder: 'desc' },
        take: 1,
      },
    },
  });

  if (!plan) {
    return { error: 'Plan not found.' };
  }

  const latestSemester = plan.semesters[0];
  const nextTermOrder = latestSemester ? latestSemester.termOrder + 1 : 1;

  const semesterYear = termName === 'Fall' ? schoolYearStart : schoolYearStart + 1;

  const existingSemester = await prisma.semester.findFirst({
    where: {
      planId: plan.id,
      termName,
      year: semesterYear,
    },
    select: { id: true },
  });

  if (existingSemester) {
    return { error: 'That semester already exists.' };
  }

  await prisma.semester.create({
    data: {
      planId: plan.id,
      termOrder: nextTermOrder,
      termName,
      year: semesterYear,
    },
  });

  revalidatePath('/plan');
  return { success: true };
}

export async function deleteSemesterFromPlan(semesterId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'You must be logged in to edit a plan.' };
  }

  const semester = await prisma.semester.findFirst({
    where: {
      id: semesterId,
      plan: {
        userId: user.id,
      },
    },
    select: {
      id: true,
      planId: true,
      termName: true,
    },
  });

  if (!semester) {
    return { error: 'Semester not found.' };
  }

  const semesterCount = await prisma.semester.count({
    where: { planId: semester.planId },
  });

  if (semesterCount <= 1) {
    return { error: 'A plan must have at least one semester.' };
  }

  await prisma.semester.delete({
    where: { id: semester.id },
  });

  revalidatePath('/plan');
  return { success: true };
}

export async function addSchoolYearToPlan(planId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'You must be logged in to edit a plan.' };
  }

  const plan = await prisma.plan.findFirst({
    where: {
      id: planId,
      userId: user.id,
    },
    include: {
      semesters: {
        orderBy: { termOrder: 'desc' },
      },
    },
  });

  if (!plan) {
    return { error: 'Plan not found.' };
  }

  const schoolYearStarts = new Set<number>();
  for (const sem of plan.semesters) {
    if (!['Fall', 'Winter', 'Spring', 'Summer'].includes(sem.termName)) continue;
    schoolYearStarts.add(sem.termName === 'Fall' ? sem.year : sem.year - 1);
  }

  const nextSchoolYearStart =
    schoolYearStarts.size > 0 ? Math.max(...Array.from(schoolYearStarts)) + 1 : DEFAULT_PLAN_START_YEAR;

  const latestTermOrder = plan.semesters[0]?.termOrder ?? 0;

  await prisma.semester.createMany({
    data: [
      {
        planId: plan.id,
        termOrder: latestTermOrder + 1,
        termName: 'Fall',
        year: nextSchoolYearStart,
      },
      {
        planId: plan.id,
        termOrder: latestTermOrder + 2,
        termName: 'Spring',
        year: nextSchoolYearStart + 1,
      },
    ],
  });

  revalidatePath('/plan');
  return { success: true };
}

export async function deleteSchoolYearFromPlan(planId: string, schoolYearStart: number) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'You must be logged in to edit a plan.' };
  }

  const plan = await prisma.plan.findFirst({
    where: {
      id: planId,
      userId: user.id,
    },
    select: { id: true },
  });

  if (!plan) {
    return { error: 'Plan not found.' };
  }

  const semesters = await prisma.semester.findMany({
    where: { planId: plan.id },
    select: {
      id: true,
      termName: true,
      year: true,
    },
  });

  const schoolYearStarts = new Set<number>();
  for (const sem of semesters) {
    if (!['Fall', 'Winter', 'Spring', 'Summer'].includes(sem.termName)) continue;
    schoolYearStarts.add(sem.termName === 'Fall' ? sem.year : sem.year - 1);
  }

  if (schoolYearStarts.size <= 1) {
    return { error: 'A plan must have at least one school year.' };
  }

  const semesterIdsToDelete = semesters
    .filter((sem) => {
      if (sem.termName === 'Fall') return sem.year === schoolYearStart;
      if (sem.termName === 'Winter' || sem.termName === 'Spring' || sem.termName === 'Summer') {
        return sem.year === schoolYearStart + 1;
      }
      return false;
    })
    .map((sem) => sem.id);

  if (semesterIdsToDelete.length === 0) {
    return { error: 'School year not found.' };
  }

  await prisma.semester.deleteMany({
    where: {
      id: { in: semesterIdsToDelete },
    },
  });

  revalidatePath('/plan');
  return { success: true };
}

export async function importPlanFromStellicPdf(input: {
  pdfBase64: string;
  mode: 'new' | 'overwrite';
  overwritePlanId?: string;
  newPlanTitle?: string;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'You must be logged in to import a plan.' };
  }

  if (!input.pdfBase64) {
    return { error: 'Please upload an audit report PDF file.' };
  }

  if (input.mode === 'overwrite' && !input.overwritePlanId) {
    return { error: 'Please select a plan to overwrite.' };
  }

  try {
    const auditText = await decodeAuditPdfText(input.pdfBase64);
    const transferAndExtraCourses = extractAuditCompletedCoursesFromText(auditText, 'transfer');
    const excludedCourseCodes = new Set(transferAndExtraCourses.map((course) => course.courseCode.toUpperCase()));
    const parsedCourses = parseStellicCoursesFromText(auditText).filter(
      (course) => !excludedCourseCodes.has(course.courseCode.toUpperCase())
    );

    if (parsedCourses.length === 0) {
      return { error: 'No courses were detected in the uploaded Stellic audit report PDF.' };
    }

    let targetPlanId = '';

    if (input.mode === 'overwrite') {
      const existingPlan = await prisma.plan.findFirst({
        where: {
          id: input.overwritePlanId,
          userId: user.id,
        },
        select: { id: true },
      });

      if (!existingPlan) {
        return { error: 'Selected plan not found.' };
      }

      targetPlanId = existingPlan.id;
      await prisma.semester.deleteMany({ where: { planId: targetPlanId } });
    } else {
      const existingCount = await prisma.plan.count({ where: { userId: user.id } });
      const planTitle = input.newPlanTitle?.trim() || `Imported Plan ${existingCount + 1}`;

      const createdPlan = await prisma.plan.create({
        data: {
          userId: user.id,
          title: planTitle,
          isPublished: false,
        },
      });

      targetPlanId = createdPlan.id;
    }

    const semesterMap = new Map<string, { termName: 'Fall' | 'Winter' | 'Spring' | 'Summer'; year: number; courses: ParsedStellicCourse[] }>();
    const fallbackCourses: ParsedStellicCourse[] = [];

    for (const course of parsedCourses) {
      if (!course.termName || !course.year) {
        fallbackCourses.push(course);
        continue;
      }

      const semesterKey = `${course.termName}-${course.year}`;
      const existing = semesterMap.get(semesterKey);
      if (existing) {
        existing.courses.push(course);
      } else {
        semesterMap.set(semesterKey, {
          termName: course.termName,
          year: course.year,
          courses: [course],
        });
      }
    }

    const orderedSemesters = Array.from(semesterMap.values()).sort((a, b) => {
      const order: Record<'Fall' | 'Winter' | 'Spring' | 'Summer', number> = {
        Fall: 0,
        Winter: 1,
        Spring: 2,
        Summer: 3,
      };

      const aStartYear = a.termName === 'Fall' ? a.year : a.year - 1;
      const bStartYear = b.termName === 'Fall' ? b.year : b.year - 1;

      if (aStartYear !== bStartYear) return aStartYear - bStartYear;
      return order[a.termName] - order[b.termName];
    });

    let termOrderCounter = 1;

    for (const sem of orderedSemesters) {
      const coursesWithCredits = await Promise.all(
        sem.courses.map(async (course) => {
          const creditsInfo = await getCourseCreditsInfoFromJSON(course.courseCode);
          const creditsMin = creditsInfo.creditsMin ?? course.credits;
          const creditsMax = creditsInfo.creditsMax ?? course.credits;
          return {
            courseCode: course.courseCode,
            creditsMin,
            creditsMax,
            locked: course.status === 'taken',
            notes: course.status === 'taken' ? 'Imported as completed from Stellic PDF' : null,
          };
        })
      );

      await prisma.semester.create({
        data: {
          planId: targetPlanId,
          termOrder: termOrderCounter,
          termName: sem.termName,
          year: sem.year,
          courses: {
            create: coursesWithCredits,
          },
        },
      });
      termOrderCounter += 1;
    }

    if (fallbackCourses.length > 0) {
      const totalCoreSemesters = 8;
      const startYear = DEFAULT_PLAN_START_YEAR;
      const buckets: ParsedStellicCourse[][] = Array.from({ length: totalCoreSemesters }, () => []);

      fallbackCourses.forEach((course, idx) => {
        buckets[idx % totalCoreSemesters].push(course);
      });

      for (let i = 0; i < totalCoreSemesters; i++) {
        if (buckets[i].length === 0) continue;

        const coursesWithCredits = await Promise.all(
          buckets[i].map(async (course) => {
            const creditsInfo = await getCourseCreditsInfoFromJSON(course.courseCode);
            const creditsMin = creditsInfo.creditsMin ?? course.credits;
            const creditsMax = creditsInfo.creditsMax ?? course.credits;
            return {
              courseCode: course.courseCode,
              creditsMin,
              creditsMax,
              locked: course.status === 'taken',
              notes: course.status === 'taken' ? 'Imported as completed from Stellic PDF' : null,
            };
          })
        );

        await prisma.semester.create({
          data: {
            planId: targetPlanId,
            termOrder: termOrderCounter,
            termName: i % 2 === 0 ? 'Fall' : 'Spring',
            year: startYear + Math.floor(i / 2),
            courses: {
              create: coursesWithCredits,
            },
          },
        });
        termOrderCounter += 1;
      }
    }

    if (transferAndExtraCourses.length > 0) {
      const existingCompleted = await prisma.completedCourse.findMany({
        where: { userId: user.id },
        select: { courseCode: true },
      });
      const existingSet = new Set(existingCompleted.map((c) => c.courseCode.toUpperCase()));

      const newCompleted = transferAndExtraCourses.filter((course) => !existingSet.has(course.courseCode));
      if (newCompleted.length > 0) {
        await prisma.completedCourse.createMany({
          data: newCompleted.map((course) => ({
            userId: user.id,
            courseCode: course.courseCode,
            title: course.title,
            sourceType: course.sourceType,
            semesterTaken: course.semesterTaken,
          })),
        });
      }
    }

    revalidatePath('/plan');
    revalidatePath('/profile');

    return { success: true, planId: targetPlanId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown import error.';
    console.error('audit pdf plan import error:', message);
    return { error: `Failed to parse/import audit report PDF: ${message}` };
  }
}

export async function importCompletedCoursesFromAuditPdf(input: {
  pdfBase64: string;
  selection?: AuditImportSelection;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  if (!input.pdfBase64) {
    return { error: 'Please upload an audit report PDF file.' };
  }

  try {
    const auditText = await decodeAuditPdfText(input.pdfBase64);
    const selection = input.selection ?? 'both';
    const parsedCourses = extractAuditCompletedCoursesFromText(auditText, selection);

    if (parsedCourses.length === 0) {
      return { error: 'No transfer or unmatched courses were detected in this audit report.' };
    }

    const existingCompleted = await prisma.completedCourse.findMany({
      where: { userId: user.id },
      select: { courseCode: true },
    });
    const existingSet = new Set(existingCompleted.map((c) => c.courseCode.toUpperCase()));

    const newCourses = parsedCourses.filter((course) => !existingSet.has(course.courseCode));

    if (newCourses.length > 0) {
      await prisma.completedCourse.createMany({
        data: newCourses.map((course) => ({
          userId: user.id,
          courseCode: course.courseCode,
          title: course.title,
          sourceType: course.sourceType,
          semesterTaken: course.semesterTaken,
        })),
      });
    }

    revalidatePath('/profile');
    revalidatePath('/plan');

    return {
      success: true,
      importedCount: newCourses.length,
      detectedCount: parsedCourses.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown import error.';
    console.error('audit pdf completed-course import error:', message);
    return { error: `Failed to parse/import audit report PDF: ${message}` };
  }
}

export async function getAllPossibleCoursesFromJSON(): Promise<{ code: string; title: string | null }[]> {
  try {
    const { courseDetailsByCode, sortedCourseCodes } = loadCourseDetailsFromJSON();
    return sortedCourseCodes.map((code) => ({
      code,
      title: courseDetailsByCode.get(code)?.title ?? null,
    }));
  } catch (err) {
    console.error("Error reading CSV for all courses:", err);
    return [];
  }
}

export async function getCourseInfoFromJSON(courseCode: string) {
  try {
    const normalizedCode = normalizeCourseCode(courseCode);
    const { courseDetailsByCode } = loadCourseDetailsFromJSON();
    const details = courseDetailsByCode.get(normalizedCode);

    let structuredPrerequisites: string[] = [];
    let structuredCorequisites: string[] = [];
    let structuredOtherRequirements: string[] = [];
    try {
      const { loadPrerequisites, formatPrerequisiteTreeForDisplay } = await import('./utils/prerequisiteChecker');
      const prerequisiteData = loadPrerequisites();
      const prerequisiteTree = prerequisiteData.prerequisite_trees[normalizedCode];
      const corequisiteTree = prerequisiteData.corequisite_trees?.[normalizedCode];
      const otherRequirementTree = prerequisiteData.other_requirement_trees?.[normalizedCode];
      if (prerequisiteTree) {
        structuredPrerequisites = formatPrerequisiteTreeForDisplay(prerequisiteTree);
      }
      if (corequisiteTree) {
        structuredCorequisites = formatPrerequisiteTreeForDisplay(corequisiteTree);
      }
      if (otherRequirementTree) {
        structuredOtherRequirements = formatPrerequisiteTreeForDisplay(otherRequirementTree);
      }
    } catch (error) {
      console.error('Failed to load structured requisites for course info:', error);
    }

    const hasStructuredRequirements =
      structuredPrerequisites.length > 0 ||
      structuredCorequisites.length > 0 ||
      structuredOtherRequirements.length > 0;

    const filteredFallbackPrerequisites = (details?.prerequisites ?? []).filter(
      (requirement) =>
        !/\binstructor\s+permission\b/i.test(requirement) &&
        !/\b(?:students\s+)?(?:may\s+not\s+enroll\s+if|cannot\s+enroll\s+if|can't\s+enroll\s+if|credit\s+not\s+granted\s+for|not\s+open\s+to)\b/i.test(requirement)
    );

    const notRestrictions = extractNotEnrollmentRestrictions([
      details?.description ?? '',
      ...(details?.prerequisites ?? []),
    ]);

    return {
      courseCode: normalizedCode,
      title: details?.title ?? null,
      description: details?.description ?? null,
      prerequisites: hasStructuredRequirements
        ? structuredPrerequisites
        : filteredFallbackPrerequisites,
      corequisites: structuredCorequisites,
      otherRequirements: structuredOtherRequirements,
      notRestrictions,
      enrollmentRestrictions: notRestrictions,
      terms: details?.terms ?? [],
    };

  } catch (err) {
    console.error('Error reading CSV for course info:', err);
    return { courseCode, title: null, description: null, prerequisites: [], corequisites: [], otherRequirements: [], notRestrictions: [], enrollmentRestrictions: [], terms: [] };
  }
}

export async function getCourseCreditsInfoFromJSON(courseCode: string): Promise<{ credits: number; creditsMin?: number; creditsMax?: number }> {
  try {
    const normalizedCode = normalizeCourseCode(courseCode);
    const { courseDetailsByCode } = loadCourseDetailsFromJSON();
    const creditsStr = courseDetailsByCode.get(normalizedCode)?.credits ?? '3';
    
    // Parse the credits string which could be "3" or "1-3"
    let credits = 3;
    let creditsMin: number | undefined;
    let creditsMax: number | undefined;
    
    if (creditsStr.includes('-')) {
      const parts = creditsStr.split('-').map((p) => Number.parseInt(p.trim(), 10));
      if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
        creditsMin = Math.min(parts[0], parts[1]);
        creditsMax = Math.max(parts[0], parts[1]);
        credits = creditsMax; // Default to max
      }
    } else {
      credits = Number.parseInt(creditsStr, 10) || 3;
    }
    
    return { credits, creditsMin, creditsMax };
  } catch (err) {
    console.error('Error reading course credits info:', err);
    return { credits: 3 };
  }
}

type CourseDetailsJsonRecord = {
  course_code?: string;
  title?: string;
  credits?: string;
  description?: string;
  enrollment_requirements?: string;
  term?: string;
  terms?: string;
};

type AggregatedCourseDetails = {
  title: string | null;
  credits: string;
  description: string | null;
  prerequisites: string[];
  terms: string[];
};

let cachedCourseDetailsData:
  | {
      courseDetailsByCode: Map<string, AggregatedCourseDetails>;
      sortedCourseCodes: string[];
    }
  | null = null;

function normalizeCourseCode(courseCode: string): string {
  return courseCode.toUpperCase().replace(/\s+/g, ' ').trim();
}

function normalizeCsvText(value: string): string {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatNotRestriction(rawRestriction: string): string {
  const cleaned = rawRestriction.replace(/^students\s+/i, '').trim();
  const normalizedCourseCodes = Array.from(
    cleaned.matchAll(/\b([A-Z]{2,6})\s*(\d{4}[A-Z]?)\b/g),
    (match) => `${match[1]} ${match[2]}`
  );

  if (normalizedCourseCodes.length > 0) {
    const restrictionBody = cleaned
      .replace(/^(?:may\s+not\s+enroll\s+if|cannot\s+enroll\s+if|can't\s+enroll\s+if|credit\s+not\s+granted\s+for|not\s+open\s+to)\s+/i, '')
      .replace(/^they\s+have\s+/i, '')
      .replace(/^previously\s+/i, '')
      .replace(/^completed\s+/i, '')
      .replace(/^received\s+credit\s+for\s+/i, '')
      .replace(/\s+(?:has|have)\s+been\s+completed\.?$/i, '')
      .replace(/\s+with\s+a\s+grade\s+of\s+[^.;]+$/i, '')
      .trim();

    const hasAnd = /\band\b/i.test(restrictionBody);
    const hasOr = /\bor\b/i.test(restrictionBody);

    if (!hasAnd || !hasOr) {
      const joiner = hasAnd ? ' AND ' : ' OR ';
      return normalizedCourseCodes.join(joiner);
    }
  }

  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
}

function extractNotEnrollmentRestrictions(texts: string[]): string[] {
  const matches = new Set<string>();
  const restrictionPattern = /(students\s+)?(?:may\s+not\s+enroll\s+if|cannot\s+enroll\s+if|can't\s+enroll\s+if|credit\s+not\s+granted\s+for|not\s+open\s+to)\s+[^.;]+/gi;

  for (const text of texts) {
    if (!text) continue;
    const normalized = normalizeCsvText(text);
    const found = normalized.match(restrictionPattern) ?? [];
    for (const raw of found) {
      const formatted = formatNotRestriction(raw);
      if (!formatted) continue;
      matches.add(formatted);
    }
  }

  return Array.from(matches);
}

function isPlaceholderCourse(courseCode: string, description: string): boolean {
  const normalizedCode = normalizeCourseCode(courseCode);
  const normalizedDescription = description.toLowerCase();
  return normalizedCode.startsWith('ZFOR ') || normalizedDescription.includes('placeholder');
}

function formatTermLabel(term: string): string {
  const cleaned = term.trim();
  if (!cleaned) {
    return cleaned;
  }

  const match = cleaned.match(/^1(\d{2})(\d)$/);
  if (!match) {
    return cleaned;
  }

  const year = 2000 + Number.parseInt(match[1], 10);
  const season = {
    '0': 'Winter',
    '2': 'Spring',
    '4': 'Summer',
    '6': 'Summer',
    '8': 'Fall',
  }[match[2]];

  return season ? `${season} ${year}` : cleaned;
}

function parseTermLabels(rawTerms: string): string[] {
  const normalized = normalizeCsvText(rawTerms);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(',')
    .map((part) => formatTermLabel(part.trim()))
    .filter(Boolean);
}

function getTermSortKey(termLabel: string): number {
  const match = termLabel.match(/^(Winter|Spring|Summer|Fall) (\d{4})$/);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  const seasonOrder = {
    Winter: 0,
    Spring: 1,
    Summer: 2,
    Fall: 3,
  } as const;

  return Number.parseInt(match[2], 10) * 10 + seasonOrder[match[1] as keyof typeof seasonOrder];
}

function loadCourseDetailsFromJSON(): {
  courseDetailsByCode: Map<string, AggregatedCourseDetails>;
  sortedCourseCodes: string[];
} {
  if (cachedCourseDetailsData) {
    return cachedCourseDetailsData;
  }

  const filePath = path.join(process.cwd(), 'data', 'uva_course_details.json');
  const records = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CourseDetailsJsonRecord[];

  const detailsMap = new Map<
    string,
    {
      title: string | null;
      credits: string;
      description: string | null;
      prerequisites: Set<string>;
      terms: Set<string>;
    }
  >();

  for (const record of records) {
    const courseCodeRaw = record.course_code ?? '';
    const courseCode = normalizeCourseCode(courseCodeRaw);
    if (!courseCode) {
      continue;
    }

    const description = normalizeCsvText(record.description ?? '');
    if (isPlaceholderCourse(courseCode, description)) {
      continue;
    }

    const existing = detailsMap.get(courseCode) ?? {
      title: null,
      credits: '3',
      description: null,
      prerequisites: new Set<string>(),
      terms: new Set<string>(),
    };

    const title = normalizeCsvText(record.title ?? '');
    if (title && (!existing.title || title.length > existing.title.length)) {
      existing.title = title;
    }

    const credits = normalizeCsvText(record.credits ?? '');
    if (credits) {
      existing.credits = credits;
    }

    if (description && (!existing.description || description.length > existing.description.length)) {
      existing.description = description;
    }

    const prereqText = normalizeCsvText(record.enrollment_requirements ?? '');
    if (prereqText) {
      existing.prerequisites.add(prereqText);
    }

    const rawTermField = record.terms ?? record.term ?? '';
    for (const termLabel of parseTermLabels(rawTermField)) {
      existing.terms.add(termLabel);
    }

    detailsMap.set(courseCode, existing);
  }

  const courseDetailsByCode = new Map<string, AggregatedCourseDetails>();
  for (const [code, detail] of detailsMap.entries()) {
    courseDetailsByCode.set(code, {
      title: detail.title,
      credits: detail.credits,
      description: detail.description,
      prerequisites: Array.from(detail.prerequisites),
      terms: Array.from(detail.terms).sort((left, right) => {
        const keyDiff = getTermSortKey(left) - getTermSortKey(right);
        return keyDiff !== 0 ? keyDiff : left.localeCompare(right);
      }),
    });
  }

  const sortedCourseCodes = Array.from(courseDetailsByCode.keys()).sort();
  cachedCourseDetailsData = { courseDetailsByCode, sortedCourseCodes };
  return cachedCourseDetailsData;
}

export async function checkCoursePrerequisites(input: {
  courseCode: string;
  completedCourses: string[];
  planSemesters: Array<{
    id: string;
    termName: string;
    year: number;
    termOrder: number;
    courses: Array<{ courseCode: string }>;
  }>;
  currentSemesterTermOrder: number;
  currentSemesterCourseCodes?: string[];
}) {
  'use server';

  try {
    const { checkPrerequisites } = await import('./utils/prerequisiteChecker');
    const user = await getCurrentUser();
    const goalProfile = user
      ? await prisma.goalProfile.findUnique({
          where: { userId: user.id },
          select: { earlyGraduation: true },
        })
      : null;
    const currentSemester = input.planSemesters.find(
      (sem) => sem.termOrder === input.currentSemesterTermOrder
    );

    // Get courses from past semesters (earlier termOrder)
    const pastCourseCodes = input.planSemesters
      .filter((sem) => sem.termOrder < input.currentSemesterTermOrder)
      .flatMap((sem) => sem.courses.map((c) => c.courseCode));

    const result = checkPrerequisites(
      input.courseCode,
      input.completedCourses,
      pastCourseCodes,
      input.currentSemesterCourseCodes ?? [],
      {
        school: user?.school ?? null,
        major: user?.major ?? null,
        additionalPrograms: user?.additionalPrograms ?? [],
        currentAcademicYear: user?.currentAcademicYear ?? null,
        gradYear: user?.gradYear ?? null,
        currentTermName: currentSemester?.termName ?? null,
        currentYear: currentSemester?.year ?? null,
        earlyGraduation: goalProfile?.earlyGraduation ?? false,
      }
    );

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Prerequisite check error:', message);
    return {
      isSatisfied: true,
      hasNoPrerequisites: true,
      hasNoCorequisites: true,
      hasNoOtherRequirements: true,
      missingCourses: [],
      detailedRequirements: [],
      missingPrerequisiteCourses: [],
      missingCorequisiteCourses: [],
      missingOtherRequirementCourses: [],
      detailedPrerequisiteRequirements: [],
      detailedCorequisiteRequirements: [],
      detailedOtherRequirements: [],
      hasUnknownPrerequisites: false,
      hasUnknownCorequisites: false,
    };
  }
}

export async function checkPlanPrerequisites(input: {
  completedCourses: string[];
  planSemesters: Array<{
    id: string;
    termName: string;
    year: number;
    termOrder: number;
    courses: Array<{ courseCode: string }>;
  }>;
}) {
  'use server';

  try {
    const { checkPrerequisites } = await import('./utils/prerequisiteChecker');
    const user = await getCurrentUser();
    const goalProfile = user
      ? await prisma.goalProfile.findUnique({
          where: { userId: user.id },
          select: { earlyGraduation: true },
        })
      : null;

    const problematicBySemester: Record<string, Record<string, any[]>> = {};

    for (const semester of input.planSemesters) {
      const pastCourseCodes = input.planSemesters
        .filter((sem) => sem.termOrder < semester.termOrder)
        .flatMap((sem) => sem.courses.map((course) => course.courseCode));

      for (const course of semester.courses) {
        const result = checkPrerequisites(
          course.courseCode,
          input.completedCourses,
          pastCourseCodes,
          semester.courses.map((courseInSemester) => courseInSemester.courseCode),
          {
            school: user?.school ?? null,
            major: user?.major ?? null,
            additionalPrograms: user?.additionalPrograms ?? [],
            currentAcademicYear: user?.currentAcademicYear ?? null,
            gradYear: user?.gradYear ?? null,
            currentTermName: semester.termName,
            currentYear: semester.year,
            earlyGraduation: goalProfile?.earlyGraduation ?? false,
          }
        );

        if (!result.isSatisfied && !(result.hasNoPrerequisites && result.hasUnknownPrerequisites)) {
          const requirements = (result.detailedRequirements?.length ?? 0) > 0
            ? result.detailedRequirements
            : result.missingCourses.map((courseCode) => ({
                type: 'course',
                description: courseCode,
                missingCourses: [courseCode],
              }));

          if (!problematicBySemester[semester.id]) {
            problematicBySemester[semester.id] = {};
          }
          problematicBySemester[semester.id][course.courseCode] = requirements;
        }
      }
    }

    return { problematicBySemester };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Plan prerequisite check error:', message);
    return { problematicBySemester: {} as Record<string, Record<string, any[]>> };
  }
}

export async function getUserProfile(computingId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { computingId },
      select: {
        id: true,
        computingId: true,
        displayName: true,
        school: true,
        major: true,
        additionalPrograms: true,
        currentAcademicYear: true,
        gradYear: true,
        bio: true,
      },
    });

    if (!user) {
      return { error: 'User not found' };
    }

    const postCount = await prisma.forumPost.count({
      where: { authorId: user.id },
    });

    return {
      user,
      postCount,
    };
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return { error: 'Failed to load user profile' };
  }
}

export async function getCompletedCourses() {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  try {
    const completedCourses = await prisma.completedCourse.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        courseCode: true,
        title: true,
        sourceType: true,
        semesterTaken: true,
      },
      orderBy: { courseCode: 'asc' },
    });

    // Enrich courses with titles from JSON data if they're missing
    const { courseDetailsByCode } = loadCourseDetailsFromJSON();
    const enrichedCourses = completedCourses.map((course) => {
      if (!course.title) {
        const normalizedCode = normalizeCourseCode(course.courseCode);
        const courseDetails = courseDetailsByCode.get(normalizedCode);
        return {
          ...course,
          title: courseDetails?.title ?? null,
        };
      }
      return course;
    });

    return { courses: enrichedCourses };
  } catch (error) {
    console.error('Error fetching completed courses:', error);
    return { error: 'Failed to load completed courses' };
  }
}

export async function addCompletedCourse(courseCode: string, title?: string, semesterTaken?: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  try {
    const normalizedCode = courseCode.toUpperCase();
    if (/\b\d{4}T\b/.test(normalizedCode)) {
      return { error: 'Transfer credits should be imported from an audit report. Manual add is only for placement/skip extra courses.' };
    }

    const course = await prisma.completedCourse.create({
      data: {
        userId: user.id,
        courseCode: normalizedCode,
        title: title || null,
        sourceType: 'manual_extra',
        semesterTaken: semesterTaken || null,
      },
    });

    revalidatePath('/profile');
    return { success: true, course };
  } catch (error) {
    console.error('Error adding completed course:', error);
    return { error: 'Failed to add completed course' };
  }
}

export async function deleteCompletedCourse(courseId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  try {
    const course = await prisma.completedCourse.findUnique({
      where: { id: courseId },
    });

    if (!course || course.userId !== user.id) {
      return { error: 'Course not found or unauthorized' };
    }

    await prisma.completedCourse.delete({
      where: { id: courseId },
    });

    revalidatePath('/profile');
    return { success: true };
  } catch (error) {
    console.error('Error deleting completed course:', error);
    return { error: 'Failed to delete completed course' };
  }
}

