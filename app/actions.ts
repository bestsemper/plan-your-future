'use server';

import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

const prisma = new PrismaClient();

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

export async function addForumReply(postId: string, body: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'You must be logged in to reply.' };
  }

  const trimmedBody = body?.trim();
  if (!trimmedBody) {
    return { error: 'Reply cannot be empty.' };
  }

  await prisma.forumAnswer.create({
    data: {
      postId,
      authorId: user.id,
      body: trimmedBody,
    },
  });

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
          displayName: true,
        },
      },
      answers: {
        orderBy: { createdAt: 'asc' },
        include: {
          author: {
            select: {
              displayName: true,
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
    viewCount: post.viewCount,
    createdAt: post.createdAt.toISOString(),
    authorDisplayName: post.author.displayName,
    canDelete: currentUser?.id === post.authorId,
    attachedPlan: post.attachedPlan,
    answers: post.answers.map((answer) => {
      const userVote = answer.votes.find((vote) => vote.userId === currentUser?.id)?.value;
      const currentUserVote: 1 | -1 | 0 = userVote === 1 ? 1 : userVote === -1 ? -1 : 0;

      return {
        id: answer.id,
        body: answer.body,
        createdAt: answer.createdAt.toISOString(),
        authorDisplayName: answer.author.displayName,
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

  const post = await prisma.forumPost.update({
    where: { id: existingPost.id },
    data: {
      viewCount: { increment: 1 },
    },
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
          displayName: true,
        },
      },
      answers: {
        orderBy: { createdAt: 'asc' },
        include: {
          author: {
            select: {
              displayName: true,
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
    canDelete: currentUser?.id === post.authorId,
    attachedPlan: post.attachedPlan,
    answers: post.answers.map((answer) => {
      const userVote = answer.votes.find((vote) => vote.userId === currentUser?.id)?.value;
      const currentUserVote: 1 | -1 | 0 = userVote === 1 ? 1 : userVote === -1 ? -1 : 0;

      return {
        id: answer.id,
        body: answer.body,
        createdAt: answer.createdAt.toISOString(),
        authorDisplayName: answer.author.displayName,
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

  const baseYear = new Date().getFullYear();
  for (let termOrder = 1; termOrder <= 8; termOrder++) {
    await prisma.semester.create({
      data: {
        planId: plan.id,
        termOrder,
        termName: termOrder % 2 === 1 ? 'Fall' : 'Spring',
        year: baseYear + Math.floor((termOrder - 1) / 2),
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

  return {
    userId: user.id,
    plans,
    allCourses,
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
  let currentYear = new Date().getFullYear();

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

export async function getAllPossibleCoursesFromCSV(): Promise<string[]> {
  try {
    const csvFilePath = path.join(process.cwd(), 'public', 'audit_requirements.csv');
    const data = fs.readFileSync(csvFilePath, 'utf-8');
    const records = parse(data, { columns: true, skip_empty_lines: true });

    const courses = new Set<string>();
    const courseRegex = /^([A-Z]{2,4})\s(\d{4})/;

    for (const reqObj of records) {
      const req: any = reqObj;
      const reqName = (req['Requirement Name'] || '');
      const constraint = req['Constraint'] || '';
      
      const reqNameMatch = reqName.match(courseRegex);
      if (reqNameMatch) {
        courses.add(reqNameMatch[0]);
      }
      
      if (constraint.includes('Course within this set of courses:')) {
        const parts = constraint.split('Course within this set of courses:');
        if (parts.length > 1) {
          const coursesList = parts[1].trim().split(',').map((s: string) => s.trim().substring(0, 7)).filter((s: string) => courseRegex.test(s));
          for (const c of coursesList) {
            courses.add(c);
          }
        }
      }
    }
    
    return Array.from(courses).sort();
  } catch (err) {
    console.error("Error reading CSV for all courses:", err);
    return [];
  }
}

export async function getCourseInfoFromCSV(courseCode: string) {
  try {
    const csvFilePath = path.join(process.cwd(), 'public', 'audit_requirements.csv');
    const data = fs.readFileSync(csvFilePath, 'utf-8');
    const records = parse(data, { columns: true, skip_empty_lines: true });

    const programs = new Set<string>();
    const fulfills = new Set<string>();

    for (const reqObj of records) {
      const req: any = reqObj;
      const cnstr = req['Constraint'] || '';
      const reqName = req['Requirement Name'] || '';
      const progName = req['Program Name'] || '';
      const parentName = req['Parent Requirement Name'] || '';

      if (reqName.includes(courseCode) || cnstr.includes(courseCode)) {
        if (progName) programs.add(progName);
        if (reqName && !reqName.includes(courseCode)) fulfills.add(reqName);
        else if (reqName && reqName.length > courseCode.length) fulfills.add(reqName);
        
        if (parentName) fulfills.add(parentName);
      }
    }

    return {
      courseCode,
      programs: Array.from(programs).slice(0, 10),
      fulfills: Array.from(fulfills).slice(0, 10)
    };
  } catch (err) {
    console.error("Error reading CSV for course info:", err);
    return { courseCode, programs: [], fulfills: [] };
  }
}

export async function getCourseCreditsFromCSV(courseCode: string): Promise<string> {
  try {
    const csvFilePath = path.join(process.cwd(), 'public', 'audit_requirements.csv');
    const data = fs.readFileSync(csvFilePath, 'utf-8');
    const records = parse(data, { columns: true, skip_empty_lines: true });
    
    let possibleUnits: number[] = [];
    for (const reqObj of records) {
      const req: any = reqObj;
      const constraint = (req['Constraint'] || '') as string;
      if (constraint.includes(` ${courseCode}`) || constraint.includes(`${courseCode},`)) {
        const match = constraint.match(/([0-9.]+)\s*units/i);
        if (match) {
          let val = parseFloat(match[1]);
          if (val <= 6) possibleUnits.push(val);
        }
      }
    }

    const parentIds = new Set<string>();
    for (const reqObj of records) {
      const req: any = reqObj;
      const reqName = (req['Requirement Name'] || '') as string;
      const constraint = (req['Constraint'] || '') as string;
      if (reqName === courseCode || (constraint.includes(` ${courseCode}`) && !constraint.includes('Course within one of these ranges'))) {
        if (req['Parent Requirement ID']) parentIds.add(req['Parent Requirement ID'] as string);
      }
    }

    for (const reqObj of records) {
      const req: any = reqObj;
      if (parentIds.has(req['Requirement ID'] as string)) {
        const constraint = (req['Constraint'] || '') as string;
        const match = constraint.match(/([0-9.]+)\s*units/i);
        if (match) {
          let val = parseFloat(match[1]);
          if (val <= 6) possibleUnits.push(val);
        }
      }
    }

    if (possibleUnits.length > 0) {
      const counts: Record<number, number> = {};
      let maxCount = 0;
      let mostFrequent = 3;
      for (const u of possibleUnits) {
         counts[u] = (counts[u] || 0) + 1;
         if (counts[u] > maxCount) {
           maxCount = counts[u];
           mostFrequent = u;
         }
      }
      return mostFrequent.toString();
    }
  } catch(e) {
    console.error("Error reading CSV for credits:", e);
  }
  return '3'; // Default fallback
}

