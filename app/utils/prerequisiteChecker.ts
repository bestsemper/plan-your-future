import fs from 'fs';
import path from 'path';

type CourseNode = {
  type: 'course';
  code: string;
};

type OperatorNode = {
  type: 'AND' | 'OR';
  children: (CourseNode | OperatorNode | CountNode)[];
};

type CountNode = {
  type: 'count';
  count: number;
  children: (CourseNode | OperatorNode | CountNode)[];
};

type PrerequisiteTree = CourseNode | OperatorNode | CountNode;

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
  type: 'course' | 'count' | 'or' | 'and';
  description: string;
  missingCourses: string[];
  satisfiedCount?: number; // For count nodes: how many are satisfied
  requiredCount?: number; // For count nodes: how many are needed
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

  if (tree.type === 'count') {
    // Count how many children are satisfied
    const satisfiedCount = tree.children.filter((child) =>
      evaluateTreeRecursive(child, taken)
    ).length;
    return satisfiedCount >= tree.count;
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

/**
 * Get missing courses from a prerequisite tree (simple list)
 */
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

  if (tree.type === 'count') {
    // For count nodes, return all courses that haven't been taken
    const missing: string[] = [];
    for (const child of tree.children) {
      if (child.type === 'course' && !taken.has(child.code.toUpperCase())) {
        missing.push(child.code);
      } else if (child.type !== 'course') {
        // Recursively check complex children
        missing.push(...getMissingCoursesRecursive(child, taken));
      }
    }
    return missing;
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

/**
 * Get detailed missing requirements from a prerequisite tree
 */
export function getDetailedMissingRequirements(
  tree: PrerequisiteTree,
  taken: Set<string>
): RequirementMissing[] {
  if (tree.type === 'course') {
    const code = tree.code.toUpperCase();
    if (taken.has(code)) {
      return [];
    }
    return [
      {
        type: 'course',
        description: `${tree.code}`,
        missingCourses: [tree.code],
      },
    ];
  }

  if (tree.type === 'count') {
    const satisfied = tree.children.filter((child) =>
      evaluateTreeRecursive(child, taken)
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
        description: `Need ${needMore} more of: ${courseOptions.join(', ')}`,
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
      requirements.push(...getDetailedMissingRequirements(child, taken));
    }
    return requirements;
  }

  if (tree.type === 'OR') {
    // Check if at least one is satisfied
    const firstSatisfied = tree.children.some((child) =>
      evaluateTreeRecursive(child, taken)
    );

    if (firstSatisfied) {
      return [];
    }

    // None are satisfied - collect course options
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
        type: 'or',
        description: `Need one of: ${courseOptions.join(', ')}`,
        missingCourses: courseOptions.filter(
          (c) => !taken.has(c.toUpperCase())
        ),
      },
    ];
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
      detailedRequirements: [],
      hasUnknownPrerequisites: !is1000Level, // Warning if not 1000-level
    };
  }

  const isSatisfied = evaluateTreeRecursive(tree, taken);
  const missingCourses = isSatisfied
    ? []
    : getMissingCoursesRecursive(tree, taken);
  const detailedRequirements = isSatisfied
    ? []
    : getDetailedMissingRequirements(tree, taken);

  return {
    isSatisfied,
    hasNoPrerequisites: false,
    missingCourses,
    detailedRequirements,
    hasUnknownPrerequisites: false,
  };
}
