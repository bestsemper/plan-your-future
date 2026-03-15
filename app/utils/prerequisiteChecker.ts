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
 * Get ALL missing courses from a prerequisite tree (flat list)
 * This recursively finds all course nodes and returns those not yet taken,
 * but respects COUNT requirements - if enough courses are taken, don't include the rest
 */
function getAllMissingCoursesFlat(
  tree: PrerequisiteTree,
  taken: Set<string>
): Set<string> {
  const missing = new Set<string>();

  function traverse(node: PrerequisiteTree) {
    if (node.type === 'course') {
      if (!taken.has(node.code.toUpperCase())) {
        missing.add(node.code);
      }
    } else if (node.type === 'count') {
      // For COUNT nodes, check if requirement is satisfied
      const satisfied = node.children.filter((child) =>
        evaluateTreeRecursive(child, taken)
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
        evaluateTreeRecursive(child, taken)
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
        description: `Missing: ${tree.code}`,
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
      requirements.push(...getDetailedMissingRequirements(child, taken));
    }
    return requirements;
  }

  if (tree.type === 'OR') {
    // Check if at least one branch is satisfied
    const firstSatisfied = tree.children.some((child) =>
      evaluateTreeRecursive(child, taken)
    );

    if (firstSatisfied) {
      return [];
    }

    // None are satisfied - analyze each branch separately
    const branchRequirements: RequirementMissing[][] = [];
    const allMissing = new Set<string>();
    
    // For each unsatisfied branch, collect its requirements
    for (const child of tree.children) {
      const branchReqs = getDetailedMissingRequirements(child, taken);
      
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
  const detailedRequirements = getDetailedMissingRequirements(tree, taken);
  
  // Get comprehensive flat list of all missing courses as a safety net
  const allMissingFlat = Array.from(getAllMissingCoursesFlat(tree, taken)).sort();
  
  // Also get the recursive missing courses
  const missingCourses = getMissingCoursesRecursive(tree, taken);

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
