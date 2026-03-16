import academicOptions from '@/data/uva_academic_options.json';

type AcademicMajorOption = {
  name: string;
  displayName?: string;
  schoolCode?: string | null;
  schoolName?: string | null;
};

type AdditionalProgram = {
  code: string;
  name: string;
};

export const PROFILE_SCHOOL_OPTIONS = [
  'College of Arts & Sciences',
  'Graduate School of Arts & Sciences',
  'School of Engineering and Applied Science',
  'School of Architecture',
  'McIntire School of Commerce',
  'Darden School of Business',
  'Frank Batten School of Leadership and Public Policy',
  'School of Data Science',
  'School of Education and Human Development',
  'School of Law',
  'School of Medicine',
  'School of Nursing',
  'School of Continuing and Professional Studies',
] as const;

const EXCLUDED_MAJOR_PATTERNS = [
  /department/i,
  /dean/i,
  /executive vp/i,
  /provost/i,
];

/**
 * Normalizes school names from the SIS data to match the full school names
 * used in requirements and profile display
 */
const normalizeSchoolName = (schoolName: string | null): string | null => {
  if (!schoolName) return null;
  
  const schoolNormalizationMap: Record<string, string> = {
    'Engineering & Applied Science': 'School of Engineering and Applied Science',
    'College & Graduate Arts & Sci': 'College of Arts & Sciences',
    'College of Arts & Sciences': 'College of Arts & Sciences',
    'Graduate School of Arts & Sciences': 'Graduate School of Arts & Sciences',
    'School of Architecture': 'School of Architecture',
    'McIntire School of Commerce': 'McIntire School of Commerce',
    'Darden School of Business': 'Darden School of Business',
    'Frank Batten School of Leadership and Public Policy': 'Frank Batten School of Leadership and Public Policy',
    'School of Data Science': 'School of Data Science',
    'School of Education and Human Development': 'School of Education and Human Development',
    'School of Law': 'School of Law',
    'School of Medicine': 'School of Medicine',
    'School of Nursing': 'School of Nursing',
    'School of Continuing and Professional Studies': 'School of Continuing and Professional Studies',
  };
  
  return schoolNormalizationMap[schoolName] || schoolName;
};

/**
 * Maps major display names to their school names from the SIS data
 * Populated from uva_academic_options.json majors with schoolName data
 * School names are normalized to match the full school names in PROFILE_SCHOOL_OPTIONS
 */
export const MAJOR_TO_SCHOOL_MAP = new Map<string, string | null>(
  (academicOptions.majors as AcademicMajorOption[])
    .filter((option) => {
      const displayName = option.displayName ?? option.name;
      return !EXCLUDED_MAJOR_PATTERNS.some((pattern) => pattern.test(displayName));
    })
    .map((option) => [option.displayName ?? option.name, normalizeSchoolName(option.schoolName ?? null)])
);

export const PROFILE_MAJOR_OPTIONS = (academicOptions.majors as AcademicMajorOption[])
  .map((option) => option.displayName ?? option.name)
  .filter((name) => !EXCLUDED_MAJOR_PATTERNS.some((pattern) => pattern.test(name)))
  .filter((name, index, items) => items.indexOf(name) === index)
  .sort((left, right) => left.localeCompare(right));

/**
 * Flattened list of all additional programs (certificates, ROTC, honors, etc.)
 * Extracted from the additional_programs section in the academic options JSON
 */
export const PROFILE_ADDITIONAL_PROGRAMS = (() => {
  const additionalPrograms = academicOptions.additional_programs as Record<string, AdditionalProgram[]> | undefined;
  if (!additionalPrograms) return [];
  
  const flattened: string[] = [];
  Object.values(additionalPrograms).forEach((category) => {
    if (Array.isArray(category)) {
      category.forEach((program) => {
        flattened.push(program.name);
      });
    }
  });
  return flattened.sort((a, b) => a.localeCompare(b));
})();