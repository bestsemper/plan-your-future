import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Load and cache requirements data
let cachedRequirementsData: Record<string, any> | null = null;

function loadRequirementsFromJSON(): Record<string, any> {
  if (cachedRequirementsData) {
    return cachedRequirementsData;
  }

  try {
    const filePath = path.join(process.cwd(), 'data', 'requirements.json');
    const fileContents = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(fileContents) as Record<string, any>;
    cachedRequirementsData = parsed;
    return parsed;
  } catch (error) {
    console.error('Error loading requirements.json:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const program = searchParams.get('program');
    const year = searchParams.get('year');

    // Load requirements data
    const requirementsData = loadRequirementsFromJSON();

    // If no program specified, return all programs
    if (!program) {
      return NextResponse.json(Object.keys(requirementsData));
    }

    // Get program data
    const programData = requirementsData[program];
    if (!programData) {
      console.warn(`Program ${program} not found in requirements`);
      return NextResponse.json(
        { error: `Program ${program} not found`, availablePrograms: Object.keys(requirementsData).slice(0, 10) },
        { status: 404 }
      );
    }

    // If no year specified, return available years
    if (!year) {
      return NextResponse.json({
        program,
        availableYears: Object.keys(programData).sort(),
      });
    }

    // Get specific year
    const yearData = programData[year];
    if (!yearData) {
      console.warn(`Year ${year} not found for program ${program}`);
      return NextResponse.json(
        { error: `Year ${year} not found for program ${program}`, availableYears: Object.keys(programData).sort() },
        { status: 404 }
      );
    }

    return NextResponse.json({
      program,
      year,
      requirements: yearData,
    });
  } catch (error) {
    console.error('Error in /api/requirements:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Failed to load requirements', details: errorMessage },
      { status: 500 }
    );
  }
}
