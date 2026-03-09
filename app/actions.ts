'use server';

import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

const prisma = new PrismaClient();

// MOCK AUTH: In a real app, this would integrate with NetBadge/SSO
// For MVP, we'll just find or create a user by computingId
export async function mockLogin(computingId: string, password: string) {
  if (!computingId) throw new Error("Computing ID is required");

  let user = await prisma.user.findUnique({
    where: { computingId }
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        computingId,
        displayName: computingId,
        major: 'Undeclared'
      }
    });

    // Create an empty goal profile
    await prisma.goalProfile.create({
      data: { userId: user.id }
    });
  }

  // Set session cookie mock here if needed
  
  return user;
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
