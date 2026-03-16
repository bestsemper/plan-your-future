import fs from 'fs';
import path from 'path';

type CourseNode = {
  type: 'course';
  code: string;
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

type OperatorNode = {
  type: 'AND' | 'OR';
  children: (CourseNode | OperatorNode | CountNode | MajorRequirementNode | ProgramRequirementNode | YearRequirementNode | SchoolRequirementNode)[];
};

type CountNode = {
  type: 'count';
  count: number;
  children: (CourseNode | OperatorNode | CountNode | MajorRequirementNode | ProgramRequirementNode | YearRequirementNode | SchoolRequirementNode)[];
};

type PrerequisiteTree = CourseNode | OperatorNode | CountNode | MajorRequirementNode | ProgramRequirementNode | YearRequirementNode | SchoolRequirementNode;

export interface Prerequisites {
  prerequisite_trees: Record<string, PrerequisiteTree>;
  prerequisite_words_by_course?: Record<string, string[]>;
  word_analysis?: Record<string, number>;
  metadata: {
    total_courses: number;
    courses_with_prerequisites: number;
    courses_without_prerequisites?: number;
    generated_at?: string;
  };
}

export interface RequirementMissing {
  type: 'course' | 'count' | 'or' | 'and' | 'major' | 'program' | 'year' | 'school';
  description: string;
  missingCourses: string[];
  satisfiedCount?: number; // For count nodes: how many are satisfied
  requiredCount?: number; // For count nodes: how many are needed
}

type UserEnrollmentProfile = {
  school?: string | null;
  major?: string | null;
  additionalPrograms?: string[];
};

function normalizeEnrollmentText(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
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

  if (normalized.includes('arts sciences') || normalized.includes('arts and sciences')) {
    aliases.add('college of arts sciences');
    aliases.add('graduate school of arts sciences');
    aliases.add('arts sciences');
  }
  if (normalized.includes('engineering applied science')) {
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
  return capitalized.replace(/\b(hsm|mba|jd|llm|phd|ms|ma|bs|ba|rotc|uva)\b/gi, (match) => match.toUpperCase());
}

function formatInlineRequirement(tree: PrerequisiteTree): string {
  if (tree.type === 'course') {
    return tree.code;
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

  if (tree.type === 'count') {
    return `${tree.count} of: ${tree.children.map(formatInlineRequirement).join(', ')}`;
  }

  if (tree.type === 'OR') {
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
  profile?: UserEnrollmentProfile
): boolean {
  if (tree.type === 'course') {
    return taken.has(tree.code.toUpperCase());
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
    return true;
  }

  if (tree.type === 'count') {
    // Count how many children are satisfied
    const satisfiedCount = tree.children.filter((child) =>
      evaluateTreeRecursive(child, taken, profile)
    ).length;
    return satisfiedCount >= tree.count;
  }

  if (tree.type === 'AND') {
    // All children must be satisfied
    return tree.children.every((child) => evaluateTreeRecursive(child, taken, profile));
  }

  if (tree.type === 'OR') {
    // At least one child must be satisfied
    return tree.children.some((child) => evaluateTreeRecursive(child, taken, profile));
  }

  return false;
}

/**
 * Get missing courses from a prerequisite tree (simple list)
 */
export function getMissingCoursesRecursive(
  tree: PrerequisiteTree,
  taken: Set<string>,
  profile?: UserEnrollmentProfile
): string[] {
  if (tree.type === 'course') {
    if (taken.has(tree.code.toUpperCase())) {
      return [];
    }
    return [tree.code];
  }

  if (tree.type === 'major' || tree.type === 'program' || tree.type === 'year' || tree.type === 'school') {
    return [];
  }

  if (tree.type === 'count') {
    // For count nodes, return all courses that haven't been taken
    const missing: string[] = [];
    for (const child of tree.children) {
      if (child.type === 'course' && !taken.has(child.code.toUpperCase())) {
        missing.push(child.code);
      } else if (child.type !== 'course') {
        // Recursively check complex children
        missing.push(...getMissingCoursesRecursive(child, taken, profile));
      }
    }
    return missing;
  }

  if (tree.type === 'AND') {
    // All branches - collect all missing
    const missing: string[] = [];
    for (const child of tree.children) {
      missing.push(...getMissingCoursesRecursive(child, taken, profile));
    }
    return missing;
  }

  if (tree.type === 'OR') {
    // At least one must be satisfied
    const firstSatisfied = tree.children.some((child) =>
      evaluateTreeRecursive(child, taken, profile)
    );

    if (firstSatisfied) {
      return [];
    }

    // None are satisfied - return all options
    const missing: string[] = [];
    for (const child of tree.children) {
      missing.push(...getMissingCoursesRecursive(child, taken, profile));
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
  profile?: UserEnrollmentProfile
): Set<string> {
  const missing = new Set<string>();

  function traverse(node: PrerequisiteTree) {
    if (node.type === 'course') {
      if (!taken.has(node.code.toUpperCase())) {
        missing.add(node.code);
      }
    } else if (node.type === 'major' || node.type === 'program' || node.type === 'year' || node.type === 'school') {
      return;
    } else if (node.type === 'count') {
      // For COUNT nodes, check if requirement is satisfied
      const satisfied = node.children.filter((child) =>
        evaluateTreeRecursive(child, taken, profile)
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
        evaluateTreeRecursive(child, taken, profile)
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
  profile?: UserEnrollmentProfile
): RequirementMissing[] {
  if (tree.type === 'course') {
    const code = tree.code.toUpperCase();
    if (taken.has(code)) {
      return [];
    }
    return [
      {
        type: 'course',
        description: `Missing: ${tree.code}`,
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
    return [];
  }

  if (tree.type === 'school') {
    if (isSchoolRequirementSatisfied(tree.requirement, profile)) {
      return [];
    }
    return [{ type: 'school', description: `School Requirement: ${tree.requirement}`, missingCourses: [] }];
  }

  if (tree.type === 'count') {
    const satisfied = tree.children.filter((child) =>
      evaluateTreeRecursive(child, taken, profile)
    );
    const needMore = tree.count - satisfied.length;

    if (needMore <= 0) {
      return [];
    }

    // Get all course options available
    const courseOptions: string[] = [];
    const collectCourses = (node: PrerequisiteTree) => {
      if (node.type === 'course') {
        courseOptions.push(node.code);
      } else if ('children' in node) {
        node.children.forEach(collectCourses);
      }
    };

    tree.children.forEach(collectCourses);

    return [
      {
        type: 'count',
        description: `Missing: Need ${needMore} more of: ${courseOptions.join(', ')}`,
        missingCourses: courseOptions.filter(
          (c) => !taken.has(c.toUpperCase())
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
      requirements.push(...getDetailedMissingRequirements(child, taken, profile));
    }
    return requirements;
  }

  if (tree.type === 'OR') {
    // Check if at least one branch is satisfied
    const firstSatisfied = tree.children.some((child) =>
      evaluateTreeRecursive(child, taken, profile)
    );

    if (firstSatisfied) {
      return [];
    }

    // None are satisfied - analyze each branch separately
    const branchRequirements: RequirementMissing[][] = [];
    const allMissing = new Set<string>();
    
    // For each unsatisfied branch, collect its requirements
    for (const child of tree.children) {
      const branchReqs = getDetailedMissingRequirements(child, taken, profile);
      
      if (branchReqs.length > 0) {
        branchRequirements.push(branchReqs);
        branchReqs.forEach(req => {
          req.missingCourses.forEach(c => allMissing.add(c));
        });
      } else if (child.type === 'course') {
        // If it's a single course that's not taken, it's a missing option
        if (!taken.has(child.code.toUpperCase())) {
          const singleCourseReq: RequirementMissing = {
            type: 'course',
            description: `Missing: ${child.code}`,
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
          return descs[0];
        }
        return `(${descs.join(' AND ')})`;
      });
      
      return [
        {
          type: 'or',
          description: `Choose one: ${descriptions.join(' OR ')}`,
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
  missingCourses: string[]; // Simple list of missing course codes
  detailedRequirements: RequirementMissing[]; // Detailed requirement descriptions
  hasUnknownPrerequisites: boolean; // No prereqs but not 1000-level
}

export function checkPrerequisites(
  courseCode: string,
  completedCourses: string[],
  plannedPastCourses: string[],
  profile?: UserEnrollmentProfile
): PrerequisiteCheckResult {
  const prerequisites = loadPrerequisites();
  const normalizedCode = courseCode.toUpperCase();
  const tree = prerequisites.prerequisite_trees[normalizedCode];

  // Combine completed and planned past courses
  const taken = new Set(
    [...completedCourses, ...plannedPastCourses].map((c) =>
      c.toUpperCase()
    )
  );

  // Check if course level
  const courseLevel = parseInt(normalizedCode.split(' ')[1]?.substring(0, 1) || '0', 10);
  const is1000Level = courseLevel === 1;

  if (!tree) {
    // No prerequisite data
    return {
      isSatisfied: true,
      hasNoPrerequisites: true,
      missingCourses: [],
      detailedRequirements: [],
      hasUnknownPrerequisites: !is1000Level, // Warning if not 1000-level
    };
  }

  const isSatisfied = evaluateTreeRecursive(tree, taken, profile);
  
  if (isSatisfied) {
    return {
      isSatisfied: true,
      hasNoPrerequisites: false,
      missingCourses: [],
      detailedRequirements: [],
      hasUnknownPrerequisites: false,
    };
  }

  // Get detailed requirements from tree structure
  const detailedRequirements = getDetailedMissingRequirements(tree, taken, profile);
  
  // Get comprehensive flat list of all missing courses as a safety net
  const allMissingFlat = Array.from(getAllMissingCoursesFlat(tree, taken, profile)).sort();
  
  // Also get the recursive missing courses
  const missingCourses = getMissingCoursesRecursive(tree, taken, profile);

  // Ensure all missing courses from the flat list are included in detailedRequirements
  const coveredCourses = new Set<string>();
  detailedRequirements.forEach(req => {
    req.missingCourses.forEach(c => coveredCourses.add(c.toUpperCase()));
  });

  // If there are missing courses not covered in detailed requirements, add a catch-all
  const uncoveredFromFlat = allMissingFlat.filter(
    c => !coveredCourses.has(c.toUpperCase())
  );

  if (uncoveredFromFlat.length > 0) {
    detailedRequirements.push({
      type: 'course',
      description: `Also required: ${uncoveredFromFlat.join(', ')}`,
      missingCourses: uncoveredFromFlat,
    });
  }

  return {
    isSatisfied: false,
    hasNoPrerequisites: false,
    missingCourses: allMissingFlat, // Use the comprehensive flat list
    detailedRequirements,
    hasUnknownPrerequisites: false,
  };
}
