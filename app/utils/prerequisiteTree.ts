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
  children: (CourseNode | OperatorNode)[];
};

type PrerequisiteNode = CourseNode | OperatorNode | CountNode;

interface TreeNode {
  id: string; // CS 111x or CS 2100
  courses: string[]; // [CS 1110, CS 1111, CS 1112] or [CS 2100]
  label: string; // "CS 111x" or "CS 2100"
  childIds: string[]; // IDs of children (to avoid circular references)
  isLeafGroup?: boolean; // True if this is a group of leaf nodes
}

interface DepartmentTree {
  department: string;
  nodes: Record<string, TreeNode>; // Record of id -> TreeNode (serializable)
  rootIds: string[]; // IDs of root nodes (non-leaf nodes with no prerequisites)
}

// Group equivalent courses like CS 1110, 1111, 1112 -> CS 111x (only group if 2+ courses)
function groupEquivalentCourses(courses: string[]): Map<string, string[]> {
  const groupMap = new Map<string, string[]>();

  courses.forEach((course) => {
    const match = course.match(/^([A-Z]+)\s(\d)(\d)(\d)(\d)$/);
    if (match) {
      const [, dept, d1, d2, d3, d4] = match;
      const groupKey = `${dept} ${d1}${d2}${d3}x`;

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, []);
      }
      groupMap.get(groupKey)!.push(course);
    }
  });

  // Filter to only keep groups with 2+ courses
  const filtered = new Map<string, string[]>();
  groupMap.forEach((courses, key) => {
    if (courses.length > 1) {
      filtered.set(key, courses);
    }
  });

  return filtered;
}

// Create a descriptive label for a group of courses
function createNodeLabel(courses: string[]): string {
  if (courses.length === 1) {
    return courses[0];
  }
  if (courses.length <= 3) {
    return courses.join(", ");
  }
  // For many courses, use abbreviated format
  const match = courses[0].match(/^([A-Z]+)\s(\d)(\d)(\d)(\d)$/);
  if (match) {
    const [, dept, d1, d2, d3] = match;
    return `${dept} ${d1}${d2}${d3}x`;
  }
  return courses.join(", ");
}

// Extract courses from prerequisite tree recursively
function extractCoursesFromPrereq(node: PrerequisiteNode): string[] {
  if (node.type === 'course') {
    return [node.code];
  } else if (node.type === 'count') {
    return node.children.flatMap((child) => extractCoursesFromPrereq(child));
  } else if (node.type === 'AND' || node.type === 'OR') {
    return node.children.flatMap((child) => extractCoursesFromPrereq(child));
  }
  return [];
}

// Get the department prefix from a course code
function getDepartment(courseCode: string): string {
  const match = courseCode.match(/^([A-Z]+)/);
  return match ? match[1] : '';
}

// Load course offerings and check if a course was offered in the last two semesters
function getRecentlyOfferedCourses(): Set<string> {
  try {
    const dataPath = path.join(process.cwd(), 'data', 'uva_course_details.json');
    const courseDetails = JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as Array<{ course_code: string; terms?: string }>;
    
    const now = new Date();
    const currentYear = now.getFullYear();
    
    // Calculate last two years worth of terms (more lenient)
    const recentYears = new Set<string>();
    recentYears.add((currentYear % 100).toString().padStart(2, '0'));
    recentYears.add(((currentYear - 1) % 100).toString().padStart(2, '0'));
    if (currentYear % 100 >= 26) {
      recentYears.add('26');
      recentYears.add('25');
    }
    
    const recentCourses = new Set<string>();
    
    courseDetails.forEach((course) => {
      if (course.terms) {
        const termsList = course.terms.split(',').map(t => t.trim());
        const hasRecentTerm = termsList.some(term => {
          // Extract year code from term (e.g., "1248" -> "12" or "1268" -> "12")
          const yearPart = term.substring(0, 2);
          return recentYears.has(yearPart);
        });
        
        if (hasRecentTerm) {
          recentCourses.add(course.course_code);
        }
      }
    });
    
    return recentCourses;
  } catch (error) {
    // If loading fails, return all courses
    return new Set();
  }
}

// Load and build the prerequisite tree
export function loadPrerequisiteTree(department?: string): DepartmentTree {
  const dataPath = path.join(process.cwd(), 'data', 'uva_prerequisites.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  const prerequisiteTrees = data.prerequisite_trees;
  const allCourses = new Set<string>();

  // Get all courses that either have prerequisites or are prerequisites
  Object.keys(prerequisiteTrees).forEach((course) => {
    allCourses.add(course);
    const prereqs = extractCoursesFromPrereq(prerequisiteTrees[course]);
    prereqs.forEach((p) => allCourses.add(p));
  });

  // Filter by department if provided
  let filteredCourses = Array.from(allCourses);
  if (department) {
    filteredCourses = filteredCourses.filter((c) => getDepartment(c) === department);
  }

  // Filter by recently offered courses (last two semesters)
  const recentCourses = getRecentlyOfferedCourses();
  if (recentCourses.size > 0) {
    filteredCourses = filteredCourses.filter((c) => recentCourses.has(c));
  }

  // Exclude specific courses that should not appear
  const excludedCourses = new Set(['CS 2102']);
  filteredCourses = filteredCourses.filter((c) => !excludedCourses.has(c));

  // Group equivalent courses
  const equivalenceMap = groupEquivalentCourses(filteredCourses);

  // Build reverse lookup: course -> what requires it
  const reverseLookup = new Map<string, { course: string; node: PrerequisiteNode }[]>();

  Object.keys(prerequisiteTrees).forEach((course) => {
    if (!filteredCourses.includes(course)) return;

    const node = prerequisiteTrees[course];
    const prerequisites = extractCoursesFromPrereq(node);

    prerequisites.forEach((prereq) => {
      if (!filteredCourses.includes(prereq)) return;

      if (!reverseLookup.has(prereq)) {
        reverseLookup.set(prereq, []);
      }
      reverseLookup.get(prereq)!.push({ course, node });
    });
  });

  // Build tree nodes
  const nodeMap = new Map<string, TreeNode>();

  // Create nodes for all courses/groups
  equivalenceMap.forEach((courses, groupId) => {
    nodeMap.set(groupId, {
      id: groupId,
      courses,
      label: createNodeLabel(courses),
      childIds: [],
    });
  });

  // Add individual ungrouped courses (if not in any group) - but avoid duplicates
  filteredCourses.forEach((course) => {
    const isInGroup = Array.from(equivalenceMap.values()).some((group) => group.includes(course));
    const nodeExists = nodeMap.has(course);
    
    if (!isInGroup && !nodeExists) {
      nodeMap.set(course, {
        id: course,
        courses: [course],
        label: course,
        childIds: [],
      });
    }
  });

  // Connect parent-child relationships using IDs (with cycle detection)
  const visited = new Set<string>();
  const hasCycle = (nodeId: string, targetId: string, depth: number = 0): boolean => {
    if (depth > 20) return false; // Cycle depth limit
    if (nodeId === targetId) return true;
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (!node) return false;

    for (const childId of node.childIds) {
      if (hasCycle(childId, targetId, depth + 1)) {
        return true;
      }
    }

    return false;
  };

  nodeMap.forEach((node) => {
    node.courses.forEach((course) => {
      const dependents = reverseLookup.get(course) || [];

      dependents.forEach(({ course: dependent }) => {
        // Find the node group/id for the dependent
        let dependentNodeId = dependent;
        for (const [groupId, courses] of equivalenceMap) {
          if (courses.includes(dependent)) {
            dependentNodeId = groupId;
            break;
          }
        }

        // Check for circular reference before adding
        visited.clear();
        if (!hasCycle(dependentNodeId, node.id) && !node.childIds.includes(dependentNodeId)) {
          node.childIds.push(dependentNodeId);
        }
      });
    });
  });

  // Find leaves (nodes with no children) and group them by their parent prerequisites
  const leaves = new Map<string, string[]>(); // parent set key -> leaf node ids
  
  nodeMap.forEach((node) => {
    if (node.childIds.length === 0) {
      // Find which nodes have this leaf as a child
      const parentIds: string[] = [];
      nodeMap.forEach((potentialParent) => {
        if (potentialParent.childIds.includes(node.id)) {
          parentIds.push(potentialParent.id);
        }
      });
      
      const parentKey = JSON.stringify(parentIds.sort());
      if (!leaves.has(parentKey)) {
        leaves.set(parentKey, []);
      }
      leaves.get(parentKey)!.push(node.id);
    }
  });

  // Create leaf groups and update the tree
  const nodesToDelete = new Set<string>();
  const newNodes = new Map<string, TreeNode>();
  
  leaves.forEach((leafIds, parentKey) => {
    if (leafIds.length > 1) {
      // Multiple leaf nodes with same prerequisites - group them
      const groupId = leafIds.sort().join('|');
      const groupCourses = leafIds.flatMap((id) => nodeMap.get(id)?.courses || []);
      
      newNodes.set(groupId, {
        id: groupId,
        courses: groupCourses,
        label: groupCourses.map((c) => c.split(' ')[1]).join(', '), // Just course numbers
        childIds: [],
        isLeafGroup: true,
      });

      // Update parents to point to group instead of individual leaves
      nodeMap.forEach((node) => {
        node.childIds = node.childIds.map((childId) => {
          if (leafIds.includes(childId)) {
            return groupId;
          }
          return childId;
        });
        // Remove duplicates
        node.childIds = [...new Set(node.childIds)];
      });

      // Mark individual leaves for deletion
      leafIds.forEach((id) => nodesToDelete.add(id));
    }
  });

  // Remove old leaf nodes and add leaf groups
  nodesToDelete.forEach((id) => nodeMap.delete(id));
  newNodes.forEach((node, id) => nodeMap.set(id, node));

  // Find roots (nodes with no prerequisites) - these won't be displayed
  const roots: TreeNode[] = [];
  const coursesWithPrerequisites = new Set<string>();

  // Mark all courses that have prerequisites
  Object.keys(prerequisiteTrees).forEach((course) => {
    if (filteredCourses.includes(course)) {
      const node = prerequisiteTrees[course];
      const hasPrereqs = extractCoursesFromPrereq(node).length > 0;
      if (hasPrereqs) {
        coursesWithPrerequisites.add(course);
      }
    }
  });

  // Roots are non-leaf nodes with no prerequisites
  nodeMap.forEach((nodeItem) => {
    if (nodeItem.childIds.length > 0) {
      // Only consider non-leaf nodes as roots
      const hasPrereqs = nodeItem.courses.some((course) =>
        coursesWithPrerequisites.has(course)
      );

      if (!hasPrereqs) {
        roots.push(nodeItem);
      }
    }
  });

  return {
    department: department || 'All',
    nodes: Object.fromEntries(nodeMap),
    rootIds: roots.map((r) => r.id),
  };
}

type SubjectEntry = {
  subject?: string;
  label?: string;
};

type AcademicOptionsData = {
  subjects?: SubjectEntry[];
};

function getDepartmentNamesFromSubjects(): Map<string, string> {
  try {
    const dataPath = path.join(process.cwd(), 'data', 'uva_academic_options.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as AcademicOptionsData;
    const subjectEntries = data.subjects || [];
    const subjectNameMap = new Map<string, string>();

    subjectEntries.forEach((entry) => {
      const mnemonic = (entry.subject || '').trim();
      if (!mnemonic) return;

      const label = (entry.label || '').trim();
      const normalizedPrefix = `${mnemonic} - `;
      let fullName: string;
      if (label.startsWith(normalizedPrefix)) {
        fullName = label.slice(normalizedPrefix.length).trim();
      } else if (label && label !== mnemonic) {
        fullName = label;
      } else {
        fullName = mnemonic;
      }

      subjectNameMap.set(mnemonic, fullName || mnemonic);
    });

    return subjectNameMap;
  } catch {
    return new Map<string, string>();
  }
}

export interface DepartmentInfo {
  mnemonic: string;
  fullName: string;
}

// Get all available departments from the data
export function getAvailableDepartments(): DepartmentInfo[] {
  const dataPath = path.join(process.cwd(), 'data', 'uva_prerequisites.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const prerequisiteTrees = data.prerequisite_trees;
  const departments = new Set<string>();
  const departmentNames = getDepartmentNamesFromSubjects();

  Object.keys(prerequisiteTrees).forEach((course) => {
    const dept = getDepartment(course);
    if (dept) departments.add(dept);
  });

  return Array.from(departments)
    .sort()
    .map((mnemonic) => ({
      mnemonic,
      fullName: departmentNames.get(mnemonic) || mnemonic,
    }));
}

export type { TreeNode, DepartmentTree };
