import academicOptions from '@/data/uva_academic_options.json';

type AcademicMajorOption = {
  name: string;
  displayName?: string;
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

export const PROFILE_MAJOR_OPTIONS = (academicOptions.majors as AcademicMajorOption[])
  .map((option) => option.displayName ?? option.name)
  .filter((name) => !EXCLUDED_MAJOR_PATTERNS.some((pattern) => pattern.test(name)))
  .filter((name, index, items) => items.indexOf(name) === index)
  .sort((left, right) => left.localeCompare(right));