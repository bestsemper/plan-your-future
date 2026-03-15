import fs from 'fs';
import path from 'path';

type CourseNode = {
  type: 'course';
  code: string;
};

type OperatorNode = {
  type: 'AND' | 'OR';
  children: (CourseNode | OperatorNode)[];
};

type PrerequisiteTree = CourseNode | OperatorNode;

export interface Prerequisites {
  prerequisite_trees: Record<string, PrerequisiteTree>;
  word_analysis: Record<string, number>;
  metadata: {
    total_courses: number;
    courses_with_prerequisites: number;
    generated_at: string;
  };
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
  taken: Set<string>
): boolean {
  if (tree.type === 'course') {
    return taken.has(tree.code.toUpperCase());
  }

  if (tree.type === 'AND') {
    // All children must be satisfied
    return tree.children.every((child) => evaluateTreeRecursive(child, taken));
  }

  if (tree.type === 'OR') {
    // At least one child must be satisfied
    return tree.children.some((child) => evaluateTreeRecursive(child, taken));
  }

  return false;
}

export function getMissingCoursesRecursive(
  tree: PrerequisiteTree,
  taken: Set<string>
): string[] {
  if (tree.type === 'course') {
    if (taken.has(tree.code.toUpperCase())) {
      return [];
    }
    return [tree.code];
  }

  if (tree.type === 'AND') {
    // All branches - collect all missing
    const missing: string[] = [];
    for (const child of tree.children) {
      missing.push(...getMissingCoursesRecursive(child, taken));
    }
    return missing;
  }

  if (tree.type === 'OR') {
    // At least one must be satisfied
    const firstSatisfied = tree.children.some((child) =>
      evaluateTreeRecursive(child, taken)
    );

    if (firstSatisfied) {
      return [];
    }

    // None are satisfied - return all options
    const missing: string[] = [];
    for (const child of tree.children) {
      missing.push(...getMissingCoursesRecursive(child, taken));
    }
    return missing;
  }

  return [];
}

export interface PrerequisiteCheckResult {
  isSatisfied: boolean;
  hasNoPrerequisites: boolean;
  missingCourses: string[];
  hasUnknownPrerequisites: boolean; // No prereqs but not 1000-level
}

export function checkPrerequisites(
  courseCode: string,
  completedCourses: string[],
  plannedPastCourses: string[]
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
      hasUnknownPrerequisites: !is1000Level, // Warning if not 1000-level
    };
  }

  const isSatisfied = evaluateTreeRecursive(tree, taken);
  const missingCourses = isSatisfied
    ? []
    : getMissingCoursesRecursive(tree, taken);

  return {
    isSatisfied,
    hasNoPrerequisites: false,
    missingCourses,
    hasUnknownPrerequisites: false,
  };
}
