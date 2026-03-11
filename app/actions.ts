'use server';

import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

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
  const cookieStore = await cookies();
  cookieStore.set('computingId', user.computingId, { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production', 
    path: '/' 
  });
  
  return user;
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const computingId = cookieStore.get('computingId')?.value;
  
  if (!computingId) return null;
  
  return await prisma.user.findUnique({
    where: { computingId }
  });
}

import { redirect } from 'next/navigation';

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete('computingId');
  redirect('/login');
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

