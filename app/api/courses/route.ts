import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// Cache the courses in memory so we don't parse the course data on every request
let cachedCourses: { id: string, mnemonic: string, number: string, title: string }[] | null = null;

function normalizeCourseCode(value: string): string {
  return value.toUpperCase().replace(/\s+/g, ' ').trim();
}

function isPlaceholderCourse(courseCode: string, description: string): boolean {
  return courseCode.startsWith('ZFOR ') || description.toLowerCase().includes('placeholder');
}

function getCourses() {
  if (cachedCourses) return cachedCourses;

  try {
    const filePath = path.join(process.cwd(), 'data', 'uva_course_details.json');
    const records = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, string>[];

    const courseSet = new Set<string>();
    const courses: { id: string, mnemonic: string, number: string, title: string }[] = [];

    records.forEach((record) => {
      const rawCourseCode = record['course_code'] || '';
      const courseCode = normalizeCourseCode(rawCourseCode);
      const title = String(record['title'] || '').trim();
      const description = String(record['description'] || '').trim();

      if (
        courseCode &&
        /^[A-Z]{2,6}\s\d{4}$/.test(courseCode) &&
        !isPlaceholderCourse(courseCode, description) &&
        !courseSet.has(courseCode)
      ) {
        courseSet.add(courseCode);
        const [mnemonic, number] = courseCode.split(' ');
        courses.push({
          id: courseCode,
          mnemonic,
          number,
          title: title || courseCode,
        });
      }
    });

    courses.sort((a, b) => a.id.localeCompare(b.id));
    cachedCourses = courses;
    return courses;
  } catch (error) {
    console.error('Error parsing CSV:', error);
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.toLowerCase();

  try {
    const allCourses = getCourses();

    if (!query) {
      return NextResponse.json(allCourses);
    }

    const filteredCourses = allCourses.filter(course =>
      course.id.toLowerCase().includes(query) ||
      course.title.toLowerCase().includes(query) ||
      course.mnemonic.toLowerCase().includes(query) ||
      course.number.includes(query)
    ).slice(0, 50);

    return NextResponse.json(filteredCourses);
  } catch (error) {
    console.error('Error fetching courses:', error);
    return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 });
  }
}
