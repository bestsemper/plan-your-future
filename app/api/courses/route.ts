import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

type CourseRecord = Record<string, string>;

interface CourseData {
  id: string;
  mnemonic: string;
  number: string;
  title: string;
  credits: string;
  creditsMin?: number;
  creditsMax?: number;
  department: string;
  career: string;
  terms: string[];
}

// Cache the courses with full details
let cachedCourses: CourseData[] | null = null;

type CourseDetailsJsonRecord = CourseRecord & {
  course_code?: string;
  title?: string;
  credits?: string;
  description?: string;
  terms?: string;
};

function normalizeCourseCode(value: string): string {
  return value.toUpperCase().replace(/\s+/g, ' ').trim();
}

function normalizeCsvText(value: string): string {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPlaceholderCourse(courseCode: string, description: string): boolean {
  return courseCode.startsWith('ZFOR ') || description.toLowerCase().includes('placeholder');
}

function parseCreditsFromString(creditsStr: string): { min?: number; max?: number } {
  const trimmed = creditsStr.trim();
  if (!trimmed) return {};

  if (trimmed.includes('-')) {
    const parts = trimmed.split('-').map((p) => Number.parseInt(p.trim(), 10));
    if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
      return { min: parts[0], max: parts[1] };
    }
  }

  const single = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(single)) {
    return { min: single, max: single };
  }

  return {};
}

function formatTermLabel(term: string): string {
  const cleaned = term.trim();
  if (!cleaned) return cleaned;

  const match = cleaned.match(/^1(\d{2})(\d)$/);
  if (!match) return cleaned;

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
  if (!normalized) return [];

  return normalized
    .split(/[,\s]+/)
    .map((part) => formatTermLabel(part.trim()))
    .filter(Boolean);
}

function getCourseCareerLevel(courseCode: string): string {
  // Extract course number from code like "CS 1110" -> "1110"
  const match = courseCode.match(/\d{4}/);
  if (!match) return 'UGRD';
  
  const courseNumber = Number.parseInt(match[0], 10);
  // 1000-4999 = Undergrad, 5000+ = Graduate
  return courseNumber >= 5000 ? 'GRAD' : 'UGRD';
}

function getCourses(): CourseData[] {
  if (cachedCourses) return cachedCourses;

  try {
    const filePath = path.join(process.cwd(), 'data', 'uva_course_details.json');
    const records = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CourseDetailsJsonRecord[];

    const courseMap = new Map<string, Omit<CourseData, 'id' | 'mnemonic' | 'number'>>();

    records.forEach((record) => {
      const rawCourseCode = record.course_code || '';
      const courseCode = normalizeCourseCode(rawCourseCode);
      const title = String(record.title || '').trim();
      const description = String(record.description || '').trim();

      if (
        !courseCode ||
        !/^[A-Z]{2,6}\s\d{3,4}$/.test(courseCode) ||
        isPlaceholderCourse(courseCode, description)
      ) {
        return;
      }

      const existing = courseMap.get(courseCode);
      const [dept] = courseCode.split(' ');
      
      const credits = normalizeCsvText(record.credits || '');
      const { min: creditsMin, max: creditsMax } = parseCreditsFromString(credits);

      const rawTermField = record.terms || '';
      const terms = parseTermLabels(rawTermField);

      // Keep first entry or prefer longer title
      if (!existing || title.length > (existing.title || '').length) {
        courseMap.set(courseCode, {
          title: title || courseCode,
          credits: credits || '3',
          creditsMin,
          creditsMax,
          department: dept,
          career: getCourseCareerLevel(courseCode),
          terms,
        });
      }
    });

    const courses: CourseData[] = Array.from(courseMap.entries()).map(([courseCode, data]) => {
      const [mnemonic, number] = courseCode.split(' ');
      return {
        id: courseCode,
        mnemonic,
        number,
        ...data,
      };
    });

    courses.sort((a, b) => a.id.localeCompare(b.id));
    cachedCourses = courses;
    return courses;
  } catch (error) {
    console.error('Error parsing courses:', error);
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.toLowerCase();
  const department = searchParams.get('department')?.toUpperCase();
  const minCredits = searchParams.get('minCredits') ? Number.parseInt(searchParams.get('minCredits')!, 10) : undefined;
  const maxCredits = searchParams.get('maxCredits') ? Number.parseInt(searchParams.get('maxCredits')!, 10) : undefined;
  const term = searchParams.get('term');
  const career = searchParams.get('career')?.toUpperCase();

  try {
    let courses = getCourses();

    // Text search
    if (query) {
      courses = courses.filter(course =>
        course.id.toLowerCase().includes(query) ||
        course.title.toLowerCase().includes(query) ||
        course.mnemonic.toLowerCase().includes(query) ||
        course.number.includes(query)
      );
    }

    // Filter by department
    if (department) {
      courses = courses.filter(course => course.department === department);
    }

    // Filter by credits range
    if (minCredits !== undefined) {
      courses = courses.filter(course => 
        course.creditsMax && course.creditsMax >= minCredits
      );
    }
    if (maxCredits !== undefined) {
      courses = courses.filter(course => 
        course.creditsMin && course.creditsMin <= maxCredits
      );
    }

    // Filter by term
    if (term) {
      courses = courses.filter(course => 
        course.terms.some(t => t.toLowerCase().includes(term.toLowerCase()))
      );
    }

    // Filter by career level
    if (career) {
      courses = courses.filter(course => course.career === career);
    }

    return NextResponse.json(courses);
  } catch (error) {
    console.error('Error fetching courses:', error);
    return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 });
  }
}

