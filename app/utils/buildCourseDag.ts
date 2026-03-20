import fs from 'fs';
import path from 'path';

export interface SimpleCourse {
  id: string;
  label: string;
  title?: string;
  prereqs: string[];
}

export interface CourseDAG {
  nodes: Map<string, SimpleCourse>;
  edges: Map<string, Set<string>>; // nodeId -> Set of childIds
}

function extractCoursesFromPrereq(prereqObj: any): string[] {
  if (!prereqObj) return [];
  
  if (prereqObj.type === 'course') {
    return [prereqObj.code];
  }
  if (prereqObj.type === 'AND' || prereqObj.type === 'OR') {
    return (prereqObj.children || []).flatMap(extractCoursesFromPrereq);
  }
  if (prereqObj.type === 'count') {
    return (prereqObj.children || []).flatMap(extractCoursesFromPrereq);
  }
  return [];
}

function getValidCourses(): Set<string> {
  try {
    const dataPath = path.join(process.cwd(), 'data', 'uva_course_details.json');
    const courseDetails = JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as Array<{ course_code: string; terms?: string; title?: string }>;
    
    const validCourses = new Set<string>();
    
    courseDetails.forEach((course) => {
      // Only include courses with non-empty terms field
      if (course.terms && course.terms.trim() !== '') {
        validCourses.add(course.course_code);
      }
    });
    
    return validCourses;
  } catch (error) {
    return new Set();
  }
}

function getSpecialTopicsCourses(): Set<string> {
  try {
    const dataPath = path.join(process.cwd(), 'data', 'uva_course_details.json');
    const courseDetails = JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as Array<{ course_code: string; title?: string }>;
    
    const specialTopicsCourses = new Set<string>();
    
    courseDetails.forEach((course) => {
      // Exclude courses whose title begins with "Special Topic"
      if (course.title && course.title.trim().startsWith('Special Topic')) {
        specialTopicsCourses.add(course.course_code);
      }
    });
    
    return specialTopicsCourses;
  } catch (error) {
    return new Set();
  }
}

function getRecentlyOfferedCourses(): Set<string> {
  try {
    const dataPath = path.join(process.cwd(), 'data', 'uva_course_details.json');
    const courseDetails = JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as Array<{ course_code: string; terms?: string }>;
    
    const recentCourses = new Set<string>();
    
    courseDetails.forEach((course) => {
      // Include any course with a non-empty terms field
      if (course.terms && course.terms.trim() !== '') {
        recentCourses.add(course.course_code);
      }
    });
    
    return recentCourses;
  } catch (error) {
    return new Set();
  }
}

function loadEquivalenceGroups(): Map<string, string> {
  try {
    const dataPath = path.join(process.cwd(), 'data', 'manual_equivalent_groups.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    
    // Map each course to its group representative
    const courseToGroup = new Map<string, string>();
    
    data.groups.forEach((group: string[]) => {
      if (group.length > 0) {
        // Use the first course as the representative
        const representative = group[0];
        group.forEach(course => {
          courseToGroup.set(course, representative);
        });
      }
    });
    
    return courseToGroup;
  } catch (error) {
    return new Map();
  }
}

function buildGroupCodeMap(courseToGroup: Map<string, string>): Map<string, string> {
  // Build a map from group codes (like "CS 111X") to group representatives (like "CS 1110")
  const groupCodeMap = new Map<string, string>();
  
  courseToGroup.forEach((representative, course) => {
    // Extract the pattern to create a group code
    const match = course.match(/^([A-Z]+)\s+(\d)(\d)(\d)(\d)$/);
    if (match) {
      const [, dept, d1, d2, d3] = match;
      const groupCode = `${dept} ${d1}${d2}${d3}X`;
      groupCodeMap.set(groupCode, representative);
    }
  });
  
  return groupCodeMap;
}

function mapCourseCodeToGroup(courseCode: string, courseToGroup: Map<string, string>, groupCodeMap: Map<string, string>): string {
  // First check if it's directly in the courseToGroup map
  if (courseToGroup.has(courseCode)) {
    return courseToGroup.get(courseCode)!;
  }
  
  // Then check if it's a group code like "CS 111X"
  if (groupCodeMap.has(courseCode)) {
    return groupCodeMap.get(courseCode)!;
  }
  
  // Otherwise, it's a standalone course
  return courseCode;
}

function createGroupLabel(groupId: string, courses: string[], courseToGroup: Map<string, string>): string {
  // Check if this group contains courses that are part of an equivalence group
  const isPartOfEquivalenceGroup = courses.length === 1 && courseToGroup.has(courses[0]);
  
  if (courses.length === 1 && !isPartOfEquivalenceGroup) {
    return courses[0];
  }
  
  // Extract the pattern (e.g., "CS 111x" from ["CS 1110", "CS 1111", "CS 1112"] or just ["CS 1110"] if it's in a group)
  const match = courses[0].match(/^([A-Z]+)\s+(\d)(\d)(\d)(\d)$/);
  if (match) {
    const [, dept, d1, d2, d3] = match;
    return `${dept} ${d1}${d2}${d3}x`;
  }
  
  return courses.join(", ");
}

export function buildCourseDag(department: string): CourseDAG {
  const dataPath = path.join(process.cwd(), 'data', 'uva_prerequisites.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  
  // Load course details with titles
  const courseDetailsPath = path.join(process.cwd(), 'data', 'uva_course_details.json');
  const courseDetailsArray = JSON.parse(fs.readFileSync(courseDetailsPath, 'utf-8')) as Array<{ course_code: string; title: string }>;
  const courseDetails = new Map<string, { title: string }>();
  courseDetailsArray.forEach(course => {
    courseDetails.set(course.course_code, { title: course.title });
  });
  
  // Ensure department has the space (e.g., "CS " instead of just "CS")
  const deptPrefix = department.endsWith(' ') ? department : department + ' ';
  
  // Load filtering data
  const validCourses = getValidCourses();
  const recentCourses = getRecentlyOfferedCourses();
  const specialTopicsCourses = getSpecialTopicsCourses();
  const courseToGroup = loadEquivalenceGroups();
  const groupCodeMap = buildGroupCodeMap(courseToGroup);
  
  // Step 1: Collect all relevant courses for this department
  const allCourses = new Map<string, { prereqs: string[] }>();
  const relevantCourses = new Set<string>();
  
  Object.entries(data.prerequisite_trees).forEach(([courseCode, prereqData]: [string, any]) => {
    if (!courseCode.startsWith(deptPrefix)) return;
    
    // Exclude special topics courses
    if (specialTopicsCourses.has(courseCode)) return;
    
    // Only include courses that exist in course_details with non-empty terms
    if (validCourses.size > 0 && !validCourses.has(courseCode)) return;
    
    // Only include recently offered courses
    if (recentCourses.size > 0 && !recentCourses.has(courseCode)) return;
    
    const prereqs = extractCoursesFromPrereq(prereqData);
    // Only keep prerequisites from the SAME department (not group codes or cross-department equivalents)
    const filteredPrereqs = prereqs.filter(p => p.startsWith(deptPrefix));
    // DON'T map to equivalence groups for same-department prerequisites - keep them as-is
    // Only include valid and recently offered prerequisites
    const validRecentPrereqs = filteredPrereqs.filter(p => 
      (validCourses.size === 0 || validCourses.has(p)) && 
      (recentCourses.size === 0 || recentCourses.has(p)) &&
      !specialTopicsCourses.has(p)
    );
    
    allCourses.set(courseCode, { prereqs: validRecentPrereqs });
    
    // Always add the course itself to relevant courses (whether or not it has prerequisites)
    relevantCourses.add(courseCode);
    // Also add any valid prerequisites
    validRecentPrereqs.forEach(prereq => relevantCourses.add(prereq));
  });
  
  // Step 2: Group equivalent courses
  // Map from group representative to list of courses in that group
  const groupMembers = new Map<string, string[]>();
  // Map from individual course to its group representative
  const courseToGroupRep = new Map<string, string>();
  
  relevantCourses.forEach(courseId => {
    const groupRep = courseToGroup.get(courseId) || courseId;
    // Only use group equivalence if both course and group rep are from the same department
    const finalGroupRep = groupRep.startsWith(deptPrefix) ? groupRep : courseId;
    courseToGroupRep.set(courseId, finalGroupRep);
    
    if (!groupMembers.has(finalGroupRep)) {
      groupMembers.set(finalGroupRep, []);
    }
    groupMembers.get(finalGroupRep)!.push(courseId);
  });
  
  // Step 3: Build nodes for groups
  const nodes = new Map<string, SimpleCourse>();
  const edges = new Map<string, Set<string>>();
  
  groupMembers.forEach((members, groupId) => {
    const label = createGroupLabel(groupId, members, courseToGroup);
    const title = courseDetails.get(members[0])?.title;
    nodes.set(groupId, {
      id: groupId,
      label,
      title,
      prereqs: [],
    });
    edges.set(groupId, new Set<string>());
  });
  
  // Step 4: Build edges between groups (avoiding duplicates)
  const edgeSet = new Set<string>();
  
  relevantCourses.forEach(courseId => {
    const courseData = allCourses.get(courseId);
    if (!courseData) return;
    
    const courseGroup = courseToGroupRep.get(courseId)!;
    
    courseData.prereqs.forEach(prereq => {
      if (!relevantCourses.has(prereq)) return;
      
      const prereqGroup = courseToGroupRep.get(prereq)!;
      if (courseGroup !== prereqGroup) {
        const edgeKey = `${prereqGroup}->${courseGroup}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.get(prereqGroup)?.add(courseGroup);
        }
      }
    });
  });
  
  // Step 5: Remove redundant edges
  const redundantEdges: [string, string][] = [];
  
  edges.forEach((children, parentId) => {
    const childArray = Array.from(children);
    
    childArray.forEach(childId => {
      childArray.forEach(otherChildId => {
        if (childId !== otherChildId && hasPath(childId, otherChildId, edges)) {
          redundantEdges.push([parentId, otherChildId]);
        }
      });
    });
  });
  
  redundantEdges.forEach(([from, to]) => {
    edges.get(from)?.delete(to);
  });
  
  // Step 6: Remove isolated nodes (nodes with no incoming or outgoing edges)
  const nodesWithEdges = new Set<string>();
  
  // Add nodes that have outgoing edges
  edges.forEach((children, nodeId) => {
    if (children.size > 0) {
      nodesWithEdges.add(nodeId);
    }
  });
  
  // Add nodes that have incoming edges
  edges.forEach((children) => {
    children.forEach(childId => {
      nodesWithEdges.add(childId);
    });
  });
  
  // Remove isolated nodes
  nodes.forEach((_, nodeId) => {
    if (!nodesWithEdges.has(nodeId)) {
      nodes.delete(nodeId);
    }
  });
  
  return { nodes, edges };
}

function hasPath(from: string, to: string, edges: Map<string, Set<string>>): boolean {
  if (from === to) return false;
  
  const visited = new Set<string>();
  const queue = [from];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === to) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    
    const children = edges.get(current) || new Set();
    queue.push(...children);
  }
  
  return false;
}
