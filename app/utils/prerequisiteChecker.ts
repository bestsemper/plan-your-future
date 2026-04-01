import fs from 'fs';
import path from 'path';
import { getAdjustedAcademicYearStanding, isFinalAcademicYear } from './academicYear';

type CourseNode = {
  type: 'course';
  code: string;
  level?: boolean;
};

type MajorRequirementNode = {
  type: 'major';
  requirement: string;
};

type ProgramRequirementNode = {
  type: 'program';
  requirement: string;
};

type YearRequirementNode = {
  type: 'year';
  requirement: string;
};

type SchoolRequirementNode = {
  type: 'school';
  requirement: string;
};

type CreditRequirementNode = {
  type: 'credit';
  credits: number;
  requirement: string;
  subject?: string;
};

type OtherRequirementNode = {
  type: 'other';
  requirement: string;
};

type OperatorNode = {
  type: 'AND' | 'OR' | 'NOT';
  children: (CourseNode | OperatorNode | CountNode | MajorRequirementNode | ProgramRequirementNode | YearRequirementNode | SchoolRequirementNode | CreditRequirementNode | OtherRequirementNode)[];
};

type CountNode = {
  type: 'count';
  count: number;
  children: (CourseNode | OperatorNode | CountNode | MajorRequirementNode | ProgramRequirementNode | YearRequirementNode | SchoolRequirementNode | CreditRequirementNode | OtherRequirementNode)[];
};

type PrerequisiteTree = CourseNode | OperatorNode | CountNode | MajorRequirementNode | ProgramRequirementNode | YearRequirementNode | SchoolRequirementNode | CreditRequirementNode | OtherRequirementNode;

export interface Prerequisites {
  prerequisite_trees: Record<string, PrerequisiteTree>;
  corequisite_trees?: Record<string, PrerequisiteTree>;
  other_requirement_trees?: Record<string, PrerequisiteTree>;
  prerequisite_words_by_course?: Record<string, string[]>;
  word_analysis?: Record<string, number>;
  metadata: {
    total_courses: number;
    courses_with_prerequisites: number;
    courses_without_prerequisites?: number;
    courses_with_corequisites?: number;
    courses_without_corequisites?: number;
    courses_with_other_requirements?: number;
    courses_without_other_requirements?: number;
    generated_at?: string;
  };
}

type ManualEquivalentGroups = {
  groups?: string[][];
};

export interface RequirementMissing {
  type: 'course' | 'count' | 'or' | 'and' | 'major' | 'program' | 'year' | 'school' | 'credit' | 'other';
  description: string;
  missingCourses: string[];
  requisiteType?: 'prerequisite' | 'corequisite' | 'other';
  satisfiedCount?: number; // For count nodes: how many are satisfied
  requiredCount?: number; // For count nodes: how many are needed
  satisfiedCredits?: number; // For credit nodes: how many credits are satisfied
  requiredCredits?: number; // For credit nodes: how many credits are required
}

type UserEnrollmentProfile = {
  school?: string | null;
  major?: string | null;
  additionalPrograms?: string[];
  currentAcademicYear?: number | null;
  gradYear?: number | null;
  currentTermName?: string | null;
  currentYear?: number | null;
  earlyGraduation?: boolean;
};

type EvaluationContext = {
  levelRequirementByCode?: Map<string, { subject: string; level: number }>;
  courseCreditByCode?: Map<string, number>;
  targetCourseSubject?: string;
};

function isAdvisoryOtherRequirement(requirement: string): boolean {
  return /\b(?:instructor(?:'s)?\s+(?:permission|consent)|permission\s+of\s+(?:the\s+)?instructor|consent\s+of\s+(?:the\s+)?instructor|permission\s+by\s+audition)\b/i.test(
    requirement
  );
}

function formatCreditValue(credits: number): string {
  return Number.isInteger(credits) ? `${credits}` : `${credits}`;
}

function parseYearLevels(requirement: string): Set<number> {
  const normalized = requirement.toLowerCase();
  const levels = new Set<number>();
  const tokenToLevel: Record<string, number> = {
    first: 1,
    '1st': 1,
    second: 2,
    '2nd': 2,
    third: 3,
    '3rd': 3,
    fourth: 4,
    '4th': 4,
  };

  for (const [token, level] of Object.entries(tokenToLevel)) {
    const pattern = new RegExp(`\\b${token}(?:[-\\s]year)?\\b`, 'i');
    if (pattern.test(normalized)) {
      levels.add(level);
    }
  }

  return levels;
}

function getUndergraduateStanding(profile?: UserEnrollmentProfile): number | null {
  return getAdjustedAcademicYearStanding(
    profile?.currentAcademicYear,
    profile?.currentTermName,
    profile?.currentYear
  );
}

function isYearRequirementSatisfied(
  requirement: string,
  profile?: UserEnrollmentProfile,
  context?: EvaluationContext
): boolean {
  const normalized = requirement.toLowerCase();
  const standing = getUndergraduateStanding(profile);
  if (standing === null) {
    return false;
  }

  if (/\bundergrad(?:uate)?\b/.test(normalized)) {
    return standing >= 1 && standing <= 4;
  }

  if (/\bgrad(?:uate)?\b/.test(normalized)) {
    return standing >= 5;
  }

  const levels = parseYearLevels(requirement);

  // A student in their final academic year can satisfy a 4th-year requirement.
  if (
    levels.has(4) &&
    standing < 4 &&
    isFinalAcademicYear(profile?.gradYear, profile?.currentTermName, profile?.currentYear)
  ) {
    return true;
  }

  if (levels.size > 0) {
    return levels.has(standing);
  }

  return false;
}

function normalizeEnrollmentText(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bbscs\b/g, 'bs computer science')
    .replace(/\bbacs\b/g, 'ba computer science')
    .replace(/\bengr\b/g, 'engineering')
    .replace(/\bengr\.?\b/g, 'engineering')
    .replace(/\bstudents?\b/g, ' ')
    .replace(/\bstanding\b/g, ' ')
    .replace(/\brestricted to\b/g, ' ')
    .replace(/\badmission to\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function schoolAliases(text: string): Set<string> {
  const normalized = normalizeEnrollmentText(text);
  const aliases = new Set<string>([normalized]);
  const tokens = new Set(normalized.split(' ').filter(Boolean));
  const hasTokens = (...required: string[]) => required.every((token) => tokens.has(token));

  if (normalized.includes('arts sciences') || normalized.includes('arts and sciences')) {
    aliases.add('college of arts sciences');
    aliases.add('graduate school of arts sciences');
    aliases.add('arts sciences');
  }
  if (hasTokens('engineering', 'applied', 'science')) {
    aliases.add('engineering applied science');
    aliases.add('engineering and applied science');
    aliases.add('school of engineering and applied science');
    aliases.add('seas');
  }
  if (normalized.includes('commerce')) {
    aliases.add('mcintire school of commerce');
    aliases.add('mcintire');
  }
  if (normalized.includes('darden')) {
    aliases.add('darden school of business');
  }
  if (normalized.includes('education human development')) {
    aliases.add('school of education and human development');
  }
  if (normalized.includes('data science')) {
    aliases.add('school of data science');
  }
  if (normalized.includes('continuing and professional studies')) {
    aliases.add('school of continuing and professional studies');
  }

  return aliases;
}

function textRoughlyMatches(left: string, right: string): boolean {
  const leftNorm = normalizeEnrollmentText(left);
  const rightNorm = normalizeEnrollmentText(right);
  if (!leftNorm || !rightNorm) return false;
  return leftNorm.includes(rightNorm) || rightNorm.includes(leftNorm);
}

function matchesAffiliation(requirement: string, candidate: string): boolean {
  if (textRoughlyMatches(requirement, candidate)) {
    return true;
  }

  const candidateTokens = new Set(normalizeEnrollmentText(candidate).split(' ').filter(Boolean));
  const requirementTokens = normalizeEnrollmentText(requirement).split(' ').filter(Boolean);
  const overlap = requirementTokens.filter((token) => candidateTokens.has(token));
  return overlap.length >= Math.min(2, candidateTokens.size || 0) && overlap.length > 0;
}

function isSchoolRequirementSatisfied(requirement: string, profile?: UserEnrollmentProfile): boolean {
  if (!profile?.school) {
    return false;
  }

  const requirementAliases = schoolAliases(requirement);
  const profileAliases = schoolAliases(profile.school);
  for (const alias of requirementAliases) {
    if (profileAliases.has(alias)) {
      return true;
    }
  }

  // Fallback for minor naming differences (e.g. "Engineering & Applied Science"
  // vs "School of Engineering and Applied Science").
  if (textRoughlyMatches(requirement, profile.school)) {
    return true;
  }

  return false;
}

function isMajorRequirementSatisfied(requirement: string, profile?: UserEnrollmentProfile): boolean {
  const affiliations = [profile?.major, ...(profile?.additionalPrograms ?? [])].filter(Boolean) as string[];
  return affiliations.some((entry) => matchesAffiliation(requirement, entry));
}

function isProgramRequirementSatisfied(requirement: string, profile?: UserEnrollmentProfile): boolean {
  const affiliations = [profile?.major, ...(profile?.additionalPrograms ?? [])].filter(Boolean) as string[];
  if (affiliations.some((entry) => matchesAffiliation(requirement, entry))) {
    return true;
  }

  if (profile?.school && textRoughlyMatches(requirement, profile.school)) {
    return true;
  }

  return false;
}

function formatRequirementText(text: string): string {
  if (!text) return text;
  const cleaned = text.replace(/^[^A-Za-z0-9]+/, '').replace(/^s:\s*/i, '');
  const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return capitalized.replace(/\b(hsm|mba|jd|llm|phd|ms|ma|bs|ba|bscs|bacs|rotc|uva)\b/gi, (match) => match.toUpperCase());
}

function formatInlineRequirement(tree: PrerequisiteTree): string {
  if (tree.type === 'course') {
    const courseDisplay = tree.level ? `${tree.code} level` : tree.code;
    return courseDisplay;
  }

  if (tree.type === 'major') {
    return `Major Restriction: ${formatRequirementText(tree.requirement)}`;
  }

  if (tree.type === 'program') {
    return `Program Restriction: ${formatRequirementText(tree.requirement)}`;
  }

  if (tree.type === 'year') {
    return `Year Requirement: ${formatRequirementText(tree.requirement)}`;
  }

  if (tree.type === 'school') {
    return `School Requirement: ${tree.requirement}`;
  }

  if (tree.type === 'credit') {
    const creditDisplay = formatCreditValue(tree.credits);
    const suffix = tree.subject ? ` of ${tree.subject}` : '';
    return `Credit Requirement: ${creditDisplay} credits${suffix}`;
  }

  if (tree.type === 'other') {
    return `Other Requirement: ${formatRequirementText(tree.requirement)}`;
  }

  if (tree.type === 'count') {
    return `${tree.count} of: ${tree.children.map(formatInlineRequirement).join(', ')}`;
  }

  if (tree.type === 'NOT') {
    const exclusions = tree.children.map(formatInlineRequirement).join(', ');
    return `NOT (${exclusions})`;
  }

  if (tree.type === 'OR') {
    if (tree.children.every((child) => child.type === 'year')) {
      return `Year Requirement: ${tree.children.map((child) => formatRequirementText(child.requirement)).join(' OR ')}`;
    }

    return tree.children.map(formatInlineRequirement).join(' OR ');
  }

  return tree.children.map(formatInlineRequirement).join(' AND ');
}

export function formatPrerequisiteTreeForDisplay(tree: PrerequisiteTree): string[] {
  if (tree.type === 'AND') {
    return tree.children.map((child) => formatInlineRequirement(child));
  }

  return [formatInlineRequirement(tree)];
}

let cachedPrerequisites: Prerequisites | null = null;
let cachedEquivalentCourseMap: Map<string, Set<string>> | null = null;
let cachedCourseLevelRequirementMap: Map<string, Map<string, { subject: string; level: number }>> | null = null;
let cachedCourseCreditMap: Map<string, number> | null = null;

function parseCatalogCredits(rawCredits: unknown): number {
  const normalized = String(rawCredits ?? '').trim();
  if (!normalized) return 0;

  const rangeMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (rangeMatch) {
    const high = Number.parseFloat(rangeMatch[2]);
    return Number.isFinite(high) ? high : 0;
  }

  const singleValue = Number.parseFloat(normalized);
  return Number.isFinite(singleValue) ? singleValue : 0;
}

function loadEquivalentCourseMap(): Map<string, Set<string>> {
  if (cachedEquivalentCourseMap) {
    return cachedEquivalentCourseMap;
  }

  const equivalentMap = new Map<string, Set<string>>();

  try {
    const equivalentPath = path.join(process.cwd(), 'data/manual_equivalent_groups.json');
    const data = fs.readFileSync(equivalentPath, 'utf-8');
    const payload = JSON.parse(data) as ManualEquivalentGroups;

    for (const group of payload.groups ?? []) {
      const normalizedGroup = Array.from(new Set(group.map((code) => code.toUpperCase().trim()).filter(Boolean)));
      if (normalizedGroup.length < 2) {
        continue;
      }

      for (const code of normalizedGroup) {
        const equivalents = equivalentMap.get(code) ?? new Set<string>();
        normalizedGroup.forEach((otherCode) => {
          if (otherCode !== code) {
            equivalents.add(otherCode);
          }
        });
        equivalentMap.set(code, equivalents);
      }
    }
  } catch (error) {
    console.error('Failed to load manual equivalent groups:', error);
  }

  cachedEquivalentCourseMap = equivalentMap;
  return equivalentMap;
}

function loadCourseRequirementContext(): {
  levelRequirementMap: Map<string, Map<string, { subject: string; level: number }>>;
  courseCreditMap: Map<string, number>;
} {
  if (cachedCourseLevelRequirementMap && cachedCourseCreditMap) {
    return {
      levelRequirementMap: cachedCourseLevelRequirementMap,
      courseCreditMap: cachedCourseCreditMap,
    };
  }

  const levelRequirementMap = new Map<string, Map<string, { subject: string; level: number }>>();
  const courseCreditMap = new Map<string, number>();

  try {
    const detailsPath = path.join(process.cwd(), 'data/uva_course_details.json');
    const rows = JSON.parse(fs.readFileSync(detailsPath, 'utf-8')) as Array<Record<string, unknown>>;

    for (const row of rows) {
      const code = String((row.course_code ?? row.code ?? '')).toUpperCase().trim();
      if (!code) continue;

      const credits = parseCatalogCredits(row.credits);
      if (credits > 0) {
        courseCreditMap.set(code, credits);
      }

      const description = String(row.description ?? '');
      const enrollmentRequirements = String(row.enrollment_requirements ?? '');
      const sourceText = `${description} ${enrollmentRequirements}`;

      const requirementsForCourse = levelRequirementMap.get(code) ?? new Map<string, { subject: string; level: number }>();
      const mixedLevelPattern = /\b([A-Z]{2,6})\s*(\d)000\s+or\s+\1\s*(\d)000(?:\s*[- ]?\s*level|\s+level)\b/gi;
      let mixedLevelMatch: RegExpExecArray | null = null;
      while ((mixedLevelMatch = mixedLevelPattern.exec(sourceText)) !== null) {
        const subject = mixedLevelMatch[1].toUpperCase();
        const firstLevel = Number.parseInt(mixedLevelMatch[2], 10);
        const secondLevel = Number.parseInt(mixedLevelMatch[3], 10);
        if (Number.isFinite(firstLevel)) {
          requirementsForCourse.set(`${subject} ${firstLevel}000`, { subject, level: firstLevel });
        }
        if (Number.isFinite(secondLevel)) {
          requirementsForCourse.set(`${subject} ${secondLevel}000`, { subject, level: secondLevel });
        }
      }

      const levelPattern = /\b([A-Z]{2,6})\s*(\d)000(?:\s*[- ]?\s*level|\s+level)\b/gi;
      let match: RegExpExecArray | null = null;
      while ((match = levelPattern.exec(sourceText)) !== null) {
        const subject = match[1].toUpperCase();
        const level = Number.parseInt(match[2], 10);
        if (!Number.isFinite(level)) continue;
        requirementsForCourse.set(`${subject} ${level}000`, { subject, level });
      }

      if (requirementsForCourse.size > 0) {
        levelRequirementMap.set(code, requirementsForCourse);
      }
    }
  } catch (error) {
    console.error('Failed to load course-level requirement context:', error);
  }

  cachedCourseLevelRequirementMap = levelRequirementMap;
  cachedCourseCreditMap = courseCreditMap;
  return { levelRequirementMap, courseCreditMap };
}

function getCourseSubject(courseCode: string): string | null {
  const normalized = courseCode.toUpperCase().replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^([A-Z]{2,6})\s+\d{4}[A-Z]?$/);
  return match ? match[1] : null;
}

function getSatisfiedCredits(
  taken: Set<string>,
  context?: EvaluationContext,
  subjectFilter?: string
): number {
  let totalCredits = 0;
  const normalizedSubjectFilter = subjectFilter?.toUpperCase().trim();

  for (const takenCode of taken) {
    const normalizedCode = takenCode.toUpperCase().replace(/\s+/g, ' ').trim();
    if (normalizedSubjectFilter) {
      const subject = getCourseSubject(normalizedCode);
      if (subject !== normalizedSubjectFilter) {
        continue;
      }
    }

    const credits = context?.courseCreditByCode?.get(normalizedCode) ?? 0;
    totalCredits += credits;
  }

  return totalCredits;
}

function isCreditRequirementSatisfied(
  requirement: CreditRequirementNode,
  taken: Set<string>,
  context?: EvaluationContext
): boolean {
  const requirementSubject = requirement.subject?.trim() || context?.targetCourseSubject;
  const satisfiedCredits = getSatisfiedCredits(taken, context, requirementSubject);
  return satisfiedCredits + Number.EPSILON >= requirement.credits;
}

function courseMatchesLevelRequirement(
  takenCourseCode: string,
  requirement: { subject: string; level: number }
): boolean {
  const normalized = takenCourseCode.toUpperCase().replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^([A-Z]{2,6})\s*(\d{4})[A-Z]?$/);
  if (!match) return false;
  const subject = match[1].toUpperCase();
  const numeric = Number.parseInt(match[2], 10);
  if (!Number.isFinite(numeric)) return false;
  const level = Math.floor(numeric / 1000);
  return subject === requirement.subject && level === requirement.level;
}

function courseRequirementSatisfied(
  courseCode: string,
  taken: Set<string>,
  context?: EvaluationContext
): boolean {
  const normalizedCode = courseCode.toUpperCase();
  if (taken.has(normalizedCode)) {
    return true;
  }

  const equivalents = loadEquivalentCourseMap().get(normalizedCode);
  if (!equivalents) {
    return false;
  }

  for (const equivalentCode of equivalents) {
    if (taken.has(equivalentCode)) {
      return true;
    }
  }

  const levelRequirement = context?.levelRequirementByCode?.get(normalizedCode);
  if (levelRequirement) {
    for (const takenCode of taken) {
      if (courseMatchesLevelRequirement(takenCode, levelRequirement)) {
        return true;
      }
    }
  }

  return false;
}

export function loadPrerequisites(): Prerequisites {
  if (cachedPrerequisites) {
    return cachedPrerequisites;
  }

  try {
    const prereqPath = path.join(process.cwd(), 'data/uva_prerequisites.json');
    const data = fs.readFileSync(prereqPath, 'utf-8');
    cachedPrerequisites = JSON.parse(data) as Prerequisites;
    return cachedPrerequisites;
  } catch (error) {
    console.error('Failed to load prerequisites:', error);
    const defaultPrereqs: Prerequisites = {
      prerequisite_trees: {},
      corequisite_trees: {},
      other_requirement_trees: {},
      word_analysis: {},
      metadata: {
        total_courses: 0,
        courses_with_prerequisites: 0,
        generated_at: '',
      },
    };
    cachedPrerequisites = defaultPrereqs;
    return defaultPrereqs;
  }
}

export function evaluateTreeRecursive(
  tree: PrerequisiteTree,
  taken: Set<string>,
  profile?: UserEnrollmentProfile,
  context?: EvaluationContext
): boolean {
  if (tree.type === 'course') {
    return courseRequirementSatisfied(tree.code, taken, context);
  }

  if (tree.type === 'major') {
    return isMajorRequirementSatisfied(tree.requirement, profile);
  }

  if (tree.type === 'program') {
    return isProgramRequirementSatisfied(tree.requirement, profile);
  }

  if (tree.type === 'school') {
    return isSchoolRequirementSatisfied(tree.requirement, profile);
  }

  if (tree.type === 'year') {
    return isYearRequirementSatisfied(tree.requirement, profile, context);
  }

  if (tree.type === 'credit') {
    return isCreditRequirementSatisfied(tree, taken, context);
  }

  if (tree.type === 'other') {
    return isAdvisoryOtherRequirement(tree.requirement);
  }

  if (tree.type === 'count') {
    // Count how many children are satisfied
    const satisfiedCount = tree.children.filter((child) =>
      evaluateTreeRecursive(child, taken, profile, context)
    ).length;
    return satisfiedCount >= tree.count;
  }

  if (tree.type === 'AND') {
    // All children must be satisfied
    return tree.children.every((child) => evaluateTreeRecursive(child, taken, profile, context));
  }

  if (tree.type === 'OR') {
    // At least one child must be satisfied
    return tree.children.some((child) => evaluateTreeRecursive(child, taken, profile, context));
  }

  return false;
}

/**
 * Get missing courses from a prerequisite tree (simple list)
 */
export function getMissingCoursesRecursive(
  tree: PrerequisiteTree,
  taken: Set<string>,
  profile?: UserEnrollmentProfile,
  context?: EvaluationContext
): string[] {
  if (tree.type === 'course') {
    if (courseRequirementSatisfied(tree.code, taken, context)) {
      return [];
    }
    return [tree.code];
  }

  if (tree.type === 'major' || tree.type === 'program' || tree.type === 'year' || tree.type === 'school' || tree.type === 'other') {
    return [];
  }

  if (tree.type === 'credit') {
    return [];
  }

  if (tree.type === 'count') {
    // For count nodes, return all courses that haven't been taken
    const missing: string[] = [];
    for (const child of tree.children) {
      if (child.type === 'course' && !courseRequirementSatisfied(child.code, taken, context)) {
        missing.push(child.code);
      } else if (child.type !== 'course') {
        // Recursively check complex children
        missing.push(...getMissingCoursesRecursive(child, taken, profile, context));
      }
    }
    return missing;
  }

  if (tree.type === 'AND') {
    // All branches - collect all missing
    const missing: string[] = [];
    for (const child of tree.children) {
      missing.push(...getMissingCoursesRecursive(child, taken, profile, context));
    }
    return missing;
  }

  if (tree.type === 'OR') {
    // At least one must be satisfied
    const firstSatisfied = tree.children.some((child) =>
      evaluateTreeRecursive(child, taken, profile, context)
    );

    if (firstSatisfied) {
      return [];
    }

    // None are satisfied - return all options
    const missing: string[] = [];
    for (const child of tree.children) {
      missing.push(...getMissingCoursesRecursive(child, taken, profile, context));
    }
    return missing;
  }

  return [];
}

/**
 * Get ALL missing courses from a prerequisite tree (flat list)
 * This recursively finds all course nodes and returns those not yet taken,
 * but respects COUNT requirements - if enough courses are taken, don't include the rest
 */
function getAllMissingCoursesFlat(
  tree: PrerequisiteTree,
  taken: Set<string>,
  profile?: UserEnrollmentProfile,
  context?: EvaluationContext
): Set<string> {
  const missing = new Set<string>();

  function traverse(node: PrerequisiteTree) {
    if (node.type === 'course') {
      if (!courseRequirementSatisfied(node.code, taken, context)) {
        missing.add(node.code);
      }
    } else if (node.type === 'major' || node.type === 'program' || node.type === 'year' || node.type === 'school' || node.type === 'credit' || node.type === 'other') {
      return;
    } else if (node.type === 'count') {
      // For COUNT nodes, check if requirement is satisfied
      const satisfied = node.children.filter((child) =>
        evaluateTreeRecursive(child, taken, profile, context)
      );
      const needMore = node.count - satisfied.length;
      
      // Only traverse children if we still need more courses
      if (needMore > 0) {
        node.children.forEach(traverse);
      }
    } else if (node.type === 'AND') {
      // For AND nodes, traverse all children (all must be satisfied)
      node.children.forEach(traverse);
    } else if (node.type === 'OR') {
      // For OR nodes, only traverse unsatisfied branches
      const isSatisfied = node.children.some((child) =>
        evaluateTreeRecursive(child, taken, profile, context)
      );
      
      if (!isSatisfied) {
        // If no branch is satisfied, we need courses from somewhere
        node.children.forEach(traverse);
      }
    }
  }

  traverse(tree);
  return missing;
}

/**
 * Get detailed missing requirements from a prerequisite tree
 */
export function getDetailedMissingRequirements(
  tree: PrerequisiteTree,
  taken: Set<string>,
  profile?: UserEnrollmentProfile,
  context?: EvaluationContext
): RequirementMissing[] {
  if (tree.type === 'course') {
    const code = tree.code.toUpperCase();
    if (courseRequirementSatisfied(code, taken, context)) {
      return [];
    }
    const courseDisplay = tree.level ? `${tree.code} level` : tree.code;
    return [
      {
        type: 'course',
        description: `Missing: ${courseDisplay}`,
        missingCourses: [tree.code],
      },
    ];
  }

  if (tree.type === 'major') {
    if (isMajorRequirementSatisfied(tree.requirement, profile)) {
      return [];
    }
    return [{ type: 'major', description: `Major Restriction: ${formatRequirementText(tree.requirement)}`, missingCourses: [] }];
  }

  if (tree.type === 'program') {
    if (isProgramRequirementSatisfied(tree.requirement, profile)) {
      return [];
    }
    return [{ type: 'program', description: `Program Restriction: ${formatRequirementText(tree.requirement)}`, missingCourses: [] }];
  }

  if (tree.type === 'year') {
    if (isYearRequirementSatisfied(tree.requirement, profile, context)) {
      return [];
    }
    return [{ type: 'year', description: `Year Requirement: ${formatRequirementText(tree.requirement)}`, missingCourses: [] }];
  }

  if (tree.type === 'school') {
    if (isSchoolRequirementSatisfied(tree.requirement, profile)) {
      return [];
    }
    return [{ type: 'school', description: `School Requirement: ${tree.requirement}`, missingCourses: [] }];
  }

  if (tree.type === 'credit') {
    if (isCreditRequirementSatisfied(tree, taken, context)) {
      return [];
    }

    const requirementSubject = tree.subject?.trim() || context?.targetCourseSubject;
    const satisfiedCredits = getSatisfiedCredits(taken, context, requirementSubject);
    const creditDisplay = formatCreditValue(tree.credits);
    const scopeSuffix = requirementSubject ? ` of ${requirementSubject}` : '';
    return [{
      type: 'credit',
      description: `Credit Requirement: ${creditDisplay} credits${scopeSuffix}`,
      missingCourses: [],
      satisfiedCredits,
      requiredCredits: tree.credits,
    }];
  }

  if (tree.type === 'other') {
    if (isAdvisoryOtherRequirement(tree.requirement)) {
      return [];
    }
    return [{ type: 'other', description: `Other Requirement: ${formatRequirementText(tree.requirement)}`, missingCourses: [] }];
  }

  if (tree.type === 'count') {
    const satisfied = tree.children.filter((child) =>
      evaluateTreeRecursive(child, taken, profile, context)
    );
    const needMore = tree.count - satisfied.length;

    if (needMore <= 0) {
      return [];
    }

    // Get all course options available
    const displayCourseOptions: string[] = [];
    const rawCourseOptions: string[] = [];
    const collectCourses = (node: PrerequisiteTree) => {
      if (node.type === 'course') {
        rawCourseOptions.push(node.code);
        displayCourseOptions.push(node.level ? `${node.code} level` : node.code);
      } else if ('children' in node) {
        node.children.forEach(collectCourses);
      }
    };

    tree.children.forEach(collectCourses);

    return [
      {
        type: 'count',
        description: `Missing: Need ${needMore} more of: ${displayCourseOptions.join(', ')}`,
        missingCourses: rawCourseOptions.filter(
          (c) => !courseRequirementSatisfied(c, taken, context)
        ),
        satisfiedCount: satisfied.length,
        requiredCount: tree.count,
      },
    ];
  }

  if (tree.type === 'AND') {
    // Collect requirements from all children
    const requirements: RequirementMissing[] = [];
    for (const child of tree.children) {
      requirements.push(...getDetailedMissingRequirements(child, taken, profile, context));
    }
    return requirements;
  }

  if (tree.type === 'OR') {
    // Check if at least one branch is satisfied
    const firstSatisfied = tree.children.some((child) =>
      evaluateTreeRecursive(child, taken, profile, context)
    );

    if (firstSatisfied) {
      return [];
    }

    // None are satisfied - analyze each branch separately
    const branchRequirements: RequirementMissing[][] = [];
    const allMissing = new Set<string>();
    
    // For each unsatisfied branch, collect its requirements
    for (const child of tree.children) {
      const branchReqs = getDetailedMissingRequirements(child, taken, profile, context);
      
      if (branchReqs.length > 0) {
        branchRequirements.push(branchReqs);
        branchReqs.forEach(req => {
          req.missingCourses.forEach(c => allMissing.add(c));
        });
      } else if (child.type === 'course') {
        // If it's a single course that's not taken, it's a missing option
        if (!courseRequirementSatisfied(child.code, taken, context)) {
          const courseDisplay = child.level ? `${child.code} level` : child.code;
          const singleCourseReq: RequirementMissing = {
            type: 'course',
            description: `Missing: ${courseDisplay}`,
            missingCourses: [child.code],
          };
          branchRequirements.push([singleCourseReq]);
          allMissing.add(child.code);
        }
      }
    }

    // If we have requirements from multiple branches, group them by branch
    if (branchRequirements.length > 0) {
      const descriptions = branchRequirements.map(branchReqs => {
        const descs = branchReqs.map(r => r.description);
        if (descs.length === 1) {
          return descs[0].replace(/^Missing:\s*/i, '').trim();
        }
        const cleaned = descs.map((desc) => desc.replace(/^Missing:\s*/i, '').trim());
        return `(${cleaned.join(' AND ')})`;
      });
      
      return [
        {
          type: 'or',
          description: `Missing: ${descriptions.join(' OR ')}`,
          missingCourses: Array.from(allMissing),
        },
      ];
    }

    return [];
  }

  return [];
}

export interface PrerequisiteCheckResult {
  isSatisfied: boolean;
  hasNoPrerequisites: boolean;
  hasNoCorequisites: boolean;
  hasNoOtherRequirements: boolean;
  missingCourses: string[]; // Simple list of missing course codes
  detailedRequirements: RequirementMissing[]; // Detailed requirement descriptions
  missingPrerequisiteCourses: string[];
  missingCorequisiteCourses: string[];
  missingOtherRequirementCourses: string[];
  detailedPrerequisiteRequirements: RequirementMissing[];
  detailedCorequisiteRequirements: RequirementMissing[];
  detailedOtherRequirements: RequirementMissing[];
  hasUnknownPrerequisites: boolean; // No prereqs but not 1000-level
  hasUnknownCorequisites: boolean;
}

export function checkPrerequisites(
  courseCode: string,
  completedCourses: string[],
  plannedPastCourses: string[],
  currentSemesterCourses: string[] = [],
  profile?: UserEnrollmentProfile
): PrerequisiteCheckResult {
  const prerequisites = loadPrerequisites();
  const normalizedCode = courseCode.toUpperCase();
  const { levelRequirementMap, courseCreditMap } = loadCourseRequirementContext();
  const evaluationContext: EvaluationContext = {
    levelRequirementByCode: levelRequirementMap.get(normalizedCode),
    courseCreditByCode: courseCreditMap,
    targetCourseSubject: normalizedCode.split(' ')[0],
  };
  const prerequisiteTree = prerequisites.prerequisite_trees[normalizedCode];
  const corequisiteTree = prerequisites.corequisite_trees?.[normalizedCode];
  const otherRequirementTree = prerequisites.other_requirement_trees?.[normalizedCode];

  const prerequisiteTaken = new Set(
    [...completedCourses, ...plannedPastCourses].map((c) =>
      c.toUpperCase()
    )
  );
  const corequisiteTaken = new Set(
    [...completedCourses, ...plannedPastCourses, ...currentSemesterCourses].map((c) =>
      c.toUpperCase()
    )
  );

  // Check if course level
  const courseLevel = parseInt(normalizedCode.split(' ')[1]?.substring(0, 1) || '0', 10);
  const is1000Level = courseLevel === 1;

  if (!prerequisiteTree && !corequisiteTree && !otherRequirementTree) {
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
      hasUnknownPrerequisites: !is1000Level,
      hasUnknownCorequisites: false,
    };
  }

  const tagRequirements = (
    requirements: RequirementMissing[],
    requisiteType: 'prerequisite' | 'corequisite' | 'other'
  ): RequirementMissing[] => requirements.map((requirement) => ({
    ...requirement,
    requisiteType,
    description:
      requirement.description.startsWith('Prerequisite:') || requirement.description.startsWith('Corequisite:') || requirement.description.startsWith('Other Requirement:')
        ? requirement.description
        : `${requisiteType === 'prerequisite' ? 'Prerequisite' : requisiteType === 'corequisite' ? 'Corequisite' : 'Other Requirement'}: ${requirement.description}`,
  }));

  const evaluateRequirementTree = (
    tree: PrerequisiteTree | undefined,
    taken: Set<string>,
    requisiteType: 'prerequisite' | 'corequisite' | 'other'
  ) => {
    if (!tree) {
      return {
        isSatisfied: true,
        missingCourses: [] as string[],
        detailedRequirements: [] as RequirementMissing[],
      };
    }

    const isSatisfied = evaluateTreeRecursive(tree, taken, profile, evaluationContext);
    if (isSatisfied) {
      return {
        isSatisfied: true,
        missingCourses: [] as string[],
        detailedRequirements: [] as RequirementMissing[],
      };
    }

    const detailedRequirements = getDetailedMissingRequirements(tree, taken, profile, evaluationContext);
    const allMissingFlat = Array.from(getAllMissingCoursesFlat(tree, taken, profile, evaluationContext)).sort();
    const coveredCourses = new Set<string>();
    detailedRequirements.forEach((req) => {
      req.missingCourses.forEach((course) => coveredCourses.add(course.toUpperCase()));
    });
    const uncoveredFromFlat = allMissingFlat.filter(
      (course) => !coveredCourses.has(course.toUpperCase())
    );

    const taggedRequirements = tagRequirements(detailedRequirements, requisiteType);
    if (uncoveredFromFlat.length > 0) {
      taggedRequirements.push({
        type: 'course',
        requisiteType,
        description: `${requisiteType === 'prerequisite' ? 'Prerequisite' : requisiteType === 'corequisite' ? 'Corequisite' : 'Other Requirement'}: Also required: ${uncoveredFromFlat.join(', ')}`,
        missingCourses: uncoveredFromFlat,
      });
    }

    return {
      isSatisfied: false,
      missingCourses: allMissingFlat,
      detailedRequirements: taggedRequirements,
    };
  };

  const prerequisiteResult = evaluateRequirementTree(prerequisiteTree, prerequisiteTaken, 'prerequisite');
  const corequisiteResult = evaluateRequirementTree(corequisiteTree, corequisiteTaken, 'corequisite');
  const otherRequirementResult = evaluateRequirementTree(otherRequirementTree, prerequisiteTaken, 'other');
  const isSatisfied = prerequisiteResult.isSatisfied && corequisiteResult.isSatisfied && otherRequirementResult.isSatisfied;

  if (isSatisfied) {
    return {
      isSatisfied: true,
      hasNoPrerequisites: !prerequisiteTree,
      hasNoCorequisites: !corequisiteTree,
      hasNoOtherRequirements: !otherRequirementTree,
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

  const combinedMissingCourses = Array.from(
    new Set([...prerequisiteResult.missingCourses, ...corequisiteResult.missingCourses, ...otherRequirementResult.missingCourses])
  ).sort();
  const detailedRequirements = [
    ...prerequisiteResult.detailedRequirements,
    ...corequisiteResult.detailedRequirements,
    ...otherRequirementResult.detailedRequirements,
  ];

  return {
    isSatisfied: false,
    hasNoPrerequisites: !prerequisiteTree,
    hasNoCorequisites: !corequisiteTree,
    hasNoOtherRequirements: !otherRequirementTree,
    missingCourses: combinedMissingCourses,
    detailedRequirements,
    missingPrerequisiteCourses: prerequisiteResult.missingCourses,
    missingCorequisiteCourses: corequisiteResult.missingCourses,
    missingOtherRequirementCourses: otherRequirementResult.missingCourses,
    detailedPrerequisiteRequirements: prerequisiteResult.detailedRequirements,
    detailedCorequisiteRequirements: corequisiteResult.detailedRequirements,
    detailedOtherRequirements: otherRequirementResult.detailedRequirements,
    hasUnknownPrerequisites: false,
    hasUnknownCorequisites: false,
  };
}
