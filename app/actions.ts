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

function parseStellicCoursesFromText(text: string): ParsedStellicCourse[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const results: ParsedStellicCourse[] = [];
  const seen = new Set<string>();

  let currentTerm: ParsedStellicCourse['termName'] = null;
  let currentYear: number | null = null;
  let sectionMode: 'taken' | 'planned' = 'planned';

  const termRegex = /\b(Fall|Winter|Spring|Summer)\s+(20\d{2})\b/i;
  const courseCodeRegex = /\b([A-Z]{2,4})\s?-?(\d{4})\b/g;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, ' ');

    const termMatch = line.match(termRegex);
    if (termMatch) {
      const termValue = termMatch[1].toLowerCase();
      currentTerm =
        termValue === 'fall'
          ? 'Fall'
          : termValue === 'winter'
            ? 'Winter'
            : termValue === 'spring'
              ? 'Spring'
              : 'Summer';
      currentYear = Number.parseInt(termMatch[2], 10);
    }

    const lowerLine = line.toLowerCase();
    if (/completed|taken|earned|fulfilled/.test(lowerLine)) {
      sectionMode = 'taken';
    }
    if (/planned|in progress|enrolled|future/.test(lowerLine)) {
      sectionMode = 'planned';
    }

    const matches = Array.from(line.matchAll(courseCodeRegex));
    for (const match of matches) {
      const code = `${match[1]} ${match[2]}`.toUpperCase();

      const statusFromLine: ParsedStellicCourse['status'] | null = /\bTaken\s*$/i.test(line)
        ? 'taken'
        : /\bPlanned\s*$/i.test(line)
          ? 'planned'
          : null;
      const courseStatus = statusFromLine ?? sectionMode;

      const dedupeKey = `${code}|${currentTerm ?? 'none'}|${currentYear ?? 'none'}|${courseStatus}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      // Planned rows usually end with "<credits>Planned" (no grade),
      // while taken rows usually include a grade token before "Taken".
      const plannedCreditMatch = line.match(/(\d+(?:\.\d+)?)\s*Planned\s*$/i);
      const takenCreditMatch = line.match(/(\d+(?:\.\d+)?)\s*(?:[A-F][+-]?|CR|NC|P|S|U|W)?\s*Taken\s*$/i);
      const genericCreditMatch = line.match(/\b(\d+(?:\.\d+)?)\s*(?:credits?|cr)\b/i);
      const creditMatch = courseStatus === 'planned'
        ? plannedCreditMatch ?? takenCreditMatch ?? genericCreditMatch
        : takenCreditMatch ?? plannedCreditMatch ?? genericCreditMatch;
      const parsedCredits = creditMatch ? Number.parseFloat(creditMatch[1]) : Number.NaN;
      const credits = Number.isNaN(parsedCredits) ? null : Math.round(parsedCredits);

      results.push({
        courseCode: code,
        termName: currentTerm,
        year: currentYear,
        status: courseStatus,
        credits,
      });
    }
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
  
  return await prisma.user.findUnique({
    where: { computingId }
  });
}

export async function updateCurrentUserProfile(data: {
  displayName: string;
  major?: string;
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

  const major = data.major?.trim() || null;
  const bio = data.bio?.trim() || null;

  let gradYear: number | null = null;
  if (data.gradYear && data.gradYear.trim() !== '') {
    const parsed = Number.parseInt(data.gradYear, 10);
    if (Number.isNaN(parsed) || parsed < 1900 || parsed > 3000) {
      return { error: 'Graduation year must be a valid year.' };
    }
    gradYear = parsed;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      displayName,
      major,
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
  if (attachedPlanId && attachedPlanId.trim() !== '') {
    const plan = await prisma.plan.findFirst({
      where: {
        id: attachedPlanId,
        userId: user.id,
      },
      select: { id: true },
    });

    if (!plan) {
      return { error: 'Selected plan does not exist.' };
    }

    validatedPlanId = plan.id;
  }

  await prisma.forumPost.create({
    data: {
      authorId: user.id,
      title: trimmedTitle,
      body: trimmedBody,
      attachedPlanId: validatedPlanId,
    },
  });

  revalidatePath('/forum');
  return { success: true };
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
              credits: true,
            },
          },
        },
      },
    },
  });

  const allCourses = await getAllPossibleCoursesFromCSV();

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

export async function getAttachedPlanViewData(planId: string) {
  const currentUser = await getCurrentUser();

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
              credits: true,
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
    const attachedPost = await prisma.forumPost.findFirst({
      where: { attachedPlanId: plan.id },
      select: { id: true },
    });
    attachedToForumPost = Boolean(attachedPost);
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
            credits: c.credits
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
  if (!courseCode || !credits) throw new Error("Course details missing");
  await prisma.plannedCourse.create({
    data: {
      semesterId,
      courseCode,
      credits
    }
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
    return { error: 'Please upload a PDF file.' };
  }

  if (input.mode === 'overwrite' && !input.overwritePlanId) {
    return { error: 'Please select a plan to overwrite.' };
  }

  try {
    const normalizedBase64 = input.pdfBase64.includes(',')
      ? input.pdfBase64.split(',').pop() ?? ''
      : input.pdfBase64;

    if (!normalizedBase64) {
      return { error: 'Uploaded file payload was empty.' };
    }

    const pdfBuffer = Buffer.from(normalizedBase64, 'base64');
    if (pdfBuffer.length === 0) {
      return { error: 'Uploaded PDF could not be decoded.' };
    }

    const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (dataBuffer: Buffer) => Promise<{ text?: string }>;
    const pdfData = await pdfParse(pdfBuffer);

    const parsedCourses = parseStellicCoursesFromText(pdfData.text || '');

    if (parsedCourses.length === 0) {
      return { error: 'No courses were detected in the uploaded Stellic PDF.' };
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
      await prisma.semester.create({
        data: {
          planId: targetPlanId,
          termOrder: termOrderCounter,
          termName: sem.termName,
          year: sem.year,
          courses: {
            create: sem.courses.map((course) => ({
              courseCode: course.courseCode,
              credits: course.credits,
              locked: course.status === 'taken',
              notes: course.status === 'taken' ? 'Imported as completed from Stellic PDF' : null,
            })),
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

        await prisma.semester.create({
          data: {
            planId: targetPlanId,
            termOrder: termOrderCounter,
            termName: i % 2 === 0 ? 'Fall' : 'Spring',
            year: startYear + Math.floor(i / 2),
            courses: {
              create: buckets[i].map((course) => ({
                courseCode: course.courseCode,
                credits: course.credits,
                locked: course.status === 'taken',
                notes: course.status === 'taken' ? 'Imported as completed from Stellic PDF' : null,
              })),
            },
          },
        });
        termOrderCounter += 1;
      }
    }

    const takenCodes = Array.from(new Set(parsedCourses.filter((c) => c.status === 'taken').map((c) => c.courseCode)));
    if (takenCodes.length > 0) {
      const existingCompleted = await prisma.completedCourse.findMany({
        where: { userId: user.id },
        select: { courseCode: true },
      });
      const existingSet = new Set(existingCompleted.map((c) => c.courseCode.toUpperCase()));

      const newCompleted = takenCodes.filter((code) => !existingSet.has(code));
      if (newCompleted.length > 0) {
        await prisma.completedCourse.createMany({
          data: newCompleted.map((courseCode) => ({
            userId: user.id,
            courseCode,
            sourceType: 'stellic_pdf',
            semesterTaken: null,
          })),
        });
      }
    }

    revalidatePath('/plan');
    revalidatePath('/profile');

    return { success: true, planId: targetPlanId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown import error.';
    console.error('stellic pdf import error:', message);
    return { error: `Failed to parse/import Stellic PDF: ${message}` };
  }
}

export async function getAllPossibleCoursesFromCSV(): Promise<{ code: string; title: string | null }[]> {
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

export async function getCourseInfoFromCSV(courseCode: string) {
  try {
    const normalizedCode = normalizeCourseCode(courseCode);
    const { courseDetailsByCode } = loadCourseDetailsFromJSON();
    const details = courseDetailsByCode.get(normalizedCode);

    return {
      courseCode: normalizedCode,
      title: details?.title ?? null,
      description: details?.description ?? null,
      prerequisites: details?.prerequisites ?? [],
      terms: details?.terms ?? [],
    };
  } catch (err) {
    console.error("Error reading CSV for course info:", err);
    return { courseCode, title: null, description: null, prerequisites: [], terms: [] };
  }
}

export async function getCourseCreditsFromCSV(courseCode: string): Promise<string> {
  try {
    const normalizedCode = normalizeCourseCode(courseCode);
    const { courseDetailsByCode } = loadCourseDetailsFromJSON();
    return courseDetailsByCode.get(normalizedCode)?.credits ?? '3';
  } catch (err) {
    console.error('Error reading course details for credits:', err);
    return '3';
  }
}

type CourseDetailsJsonRecord = {
  course_code?: string;
  title?: string;
  credits?: string;
  description?: string;
  enrollment_requirements?: string;
  term?: string;
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

    const termLabel = formatTermLabel(record.term ?? '');
    if (termLabel) {
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
}) {
  'use server';

  try {
    const { checkPrerequisites } = await import('./utils/prerequisiteChecker');
    
    // Get courses from past semesters (earlier termOrder)
    const pastCourseCodes = input.planSemesters
      .filter((sem) => sem.termOrder < input.currentSemesterTermOrder)
      .flatMap((sem) => sem.courses.map((c) => c.courseCode));

    const result = checkPrerequisites(
      input.courseCode,
      input.completedCourses,
      pastCourseCodes
    );

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Prerequisite check error:', message);
    return {
      isSatisfied: true,
      hasNoPrerequisites: true,
      missingCourses: [],
      hasUnknownPrerequisites: false,
    };
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
        major: true,
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
    const course = await prisma.completedCourse.create({
      data: {
        userId: user.id,
        courseCode: courseCode.toUpperCase(),
        title: title || null,
        sourceType: 'manual',
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

