import fs from 'fs';
import path from 'path';

export interface SimpleCourse {
  id: string;
  label: string;
  title?: string;
  description?: string;
  type?: string;
  prereqs: string[];
  coreqs?: string[];
  departmentOrs?: string[];
  coreqOrs?: string[];
}

export interface CourseDAG {
  nodes: Map<string, SimpleCourse>;
  edges: Map<string, Set<string>>; // nodeId -> Set of childIds
  coreqEdges?: Map<string, Set<string>>; // nodeId -> Set of coreq childIds
}

function extractCoursesFromPrereq(prereqObj: any): string[] {
  if (!prereqObj) return [];
  
  if (prereqObj.type === 'course') {
    return [prereqObj.code];
  }
  if (prereqObj.type === 'COREQ') {
    // Skip COREQ nodes - they should be handled separately by extractCoursesFromCoreq
    return [];
  }
  if (prereqObj.type === 'AND' || prereqObj.type === 'OR') {
    return (prereqObj.children || []).flatMap(extractCoursesFromPrereq);
  }
  if (prereqObj.type === 'count') {
    return (prereqObj.children || []).flatMap(extractCoursesFromPrereq);
  }
  return [];
}

function extractCoursesFromCoreq(prereqObj: any): string[] {
  if (!prereqObj) return [];
  
  let coreqs: string[] = [];
  
  // Recursively search for COREQ nodes in the tree
  function findCoreqs(node: any): void {
    if (!node) return;
    
    if (node.type === 'COREQ' && node.children) {
      // Extract courses from inside the COREQ
      node.children.forEach((child: any) => {
        if (child.type === 'course') {
          coreqs.push(child.code);
        } else if (child.type === 'OR' || child.type === 'AND') {
          // Recursively extract from OR/AND inside COREQ
          extractFromLogical(child);
        }
      });
    } else if (node.type === 'AND' || node.type === 'OR') {
      // Search children for COREQ nodes
      node.children?.forEach((child: any) => {
        findCoreqs(child);
      });
    }
  }
  
  function extractFromLogical(node: any): void {
    if (!node || !node.children) return;
    node.children.forEach((child: any) => {
      if (child.type === 'course') {
        coreqs.push(child.code);
      } else if (child.type === 'OR' || child.type === 'AND') {
        extractFromLogical(child);
      }
    });
  }
  
  findCoreqs(prereqObj);
  return coreqs;
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
  // Only use "x" format for actual groups with 2+ courses in the same department
  // Cross-department equivalences should not trigger "x" suffix for single courses
  if (courses.length === 1) {
    return courses[0];
  }
  
  // Multiple courses - use abbreviated format
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
  
  // Load course details with titles and descriptions
  const courseDetailsPath = path.join(process.cwd(), 'data', 'uva_course_details.json');
  const courseDetailsArray = JSON.parse(fs.readFileSync(courseDetailsPath, 'utf-8')) as Array<{ course_code: string; title: string; description?: string }>;
  const courseDetails = new Map<string, { title: string; description?: string }>();
  courseDetailsArray.forEach(course => {
    courseDetails.set(course.course_code, { title: course.title, description: course.description });
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
  const allCourses = new Map<string, { prereqs: string[]; coreqs: string[]; rawPrereq?: any }>();
  const relevantCourses = new Set<string>();
  
  Object.entries(data.prerequisite_trees).forEach(([courseCode, prereqData]: [string, any]) => {
    if (!courseCode.startsWith(deptPrefix)) return;
    
    // Exclude special topics courses
    if (specialTopicsCourses.has(courseCode)) return;
    
    const prereqs = extractCoursesFromPrereq(prereqData);
    const coreqs = extractCoursesFromCoreq(prereqData);
    
    if (courseCode === 'SYS 4055') {
      console.log('DEBUG: Processing SYS 4055, extracted prereqs:', prereqs);
    }
    
    // Only keep prerequisites from the SAME department (not group codes or cross-department equivalents)
    const filteredPrereqs = prereqs.filter(p => p.startsWith(deptPrefix));
    const filteredCoreqs = coreqs.filter(p => p.startsWith(deptPrefix));
    
    if (courseCode === 'SYS 4055') {
      console.log('DEBUG: After filtering, filtered prereqs:', filteredPrereqs);
    }
    
    // DON'T map to equivalence groups for same-department prerequisites - keep them as-is
    // Include all valid prerequisites (don't filter by validCourses or recency)
    const validRecentPrereqs = filteredPrereqs.filter(p => 
      !specialTopicsCourses.has(p)
    );
    
    if (courseCode === 'SYS 4055') {
      console.log('DEBUG: After special topics filter, validRecentPrereqs:', validRecentPrereqs);
    }
    
    const validRecentCoreqs = filteredCoreqs.filter(p => 
      !specialTopicsCourses.has(p)
    );
    
    allCourses.set(courseCode, { prereqs: validRecentPrereqs, coreqs: validRecentCoreqs, rawPrereq: prereqData });
    
    // Always add the course itself to relevant courses (whether or not it has prerequisites)
    relevantCourses.add(courseCode);
    // Also add any valid prerequisites and corequisites
    validRecentPrereqs.forEach(prereq => relevantCourses.add(prereq));
    validRecentCoreqs.forEach(coreq => relevantCourses.add(coreq));
  });
  
  if (department === 'SYS') {
    console.log('DEBUG: relevantCourses after step 1:', Array.from(relevantCourses));
  }
  
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
  const coreqEdges = new Map<string, Set<string>>();
  
  groupMembers.forEach((members, groupId) => {
    const label = createGroupLabel(groupId, members, courseToGroup);
    const details = courseDetails.get(members[0]);
    nodes.set(groupId, {
      id: groupId,
      label,
      title: details?.title,
      description: details?.description,
      prereqs: [],
      coreqs: [],
    });
    edges.set(groupId, new Set<string>());
    coreqEdges.set(groupId, new Set<string>());

  });
  
  // Step 4: Build edges between groups (avoiding duplicates)
  const edgeSet = new Set<string>();
  const protectedEdges = new Set<string>(); // Edges from direct AND prerequisites - should not be removed as redundant
  
  // Helper function to extract course level (e.g., "CS 3100" -> 3)
  const getCourseLevel = (courseId: string): number => {
    const match = courseId.match(/(\d)(\d{3})/);
    if (match) {
      return parseInt(match[1]);
    }
    return 0;
  };
  
  let logicNodeCounter = 0;

  const buildLogicTree = (node: any, targetGroup: string, targetLevel: number, isInOr: boolean): string[] => {
    if (!node) return [];
    
    if (node.type === 'COREQ') {
      // Skip COREQ nodes - they should be handled separately by coreqEdges extraction
      return [];
    }

    if (node.type === 'course') {
      const prereq = node.code;
      if (!relevantCourses.has(prereq)) return [];
      
      const prereqGroup = courseToGroupRep.get(prereq);
      if (!prereqGroup) return [];
      
      const prereqLevel = getCourseLevel(prereq);
      // Skip if prerequisite has a higher level than the course (parsing error)
      if (prereqLevel > targetLevel) return [];
      
      // Avoid self-references
      if (prereqGroup === targetGroup) return [];
      
      return [prereqGroup];
    }
    
    if (node.type === 'NOT') {
      // NOT nodes are exclusion constraints, not actual prerequisites — skip entirely
      return [];
    }

    if (node.type === 'AND' || node.type === 'OR' || node.type === 'count') {
      const childIds: string[] = (node.children || []).flatMap((c: any) => buildLogicTree(c, targetGroup, targetLevel, isInOr));
      // Deduplicate
      return Array.from(new Set<string>(childIds));
    }

    if (node.children) {
      return (node.children || []).flatMap((c: any) => buildLogicTree(c, targetGroup, targetLevel, isInOr)) as string[];
    }
    return [];
  };
  
  relevantCourses.forEach(courseId => {
    const courseData = allCourses.get(courseId);
    if (!courseData) return;
    
    const courseGroup = courseToGroupRep.get(courseId);
    if (!courseGroup) {
      // Course exists but isn't in courseToGroupRep mapping - shouldn't happen but handle gracefully
      console.warn(`Course ${courseId} in relevantCourses but not in courseToGroupRep`);
      return;
    }
    const courseLevel = getCourseLevel(courseId);
    
    if (courseData.rawPrereq) {
      // Helper to extract corequisites from anywhere in the tree
      const extractAllCoreqs = (node: any): string[] => {
        if (!node) return [];
        if (node.type === 'COREQ') {
          // Extract all courses from COREQ node and its children
          return extractCoursesFromCoreq(node);
        }
        if (node.type === 'AND' || node.type === 'OR') {
          // Recursively search for COREQ nodes in children
          return (node.children || []).flatMap(extractAllCoreqs);
        }
        return [];
      };
      
      // Extract and add corequisite edges
      const coreqCourses = extractAllCoreqs(courseData.rawPrereq)
        .filter(c => c.startsWith(deptPrefix));
      
      coreqCourses.forEach(coreqCode => {
        // Ensure coreq course has a group representation even if not in main tree
        if (!courseToGroupRep.has(coreqCode)) {
          const groupRep = courseToGroup.get(coreqCode) || coreqCode;
          const finalGroupRep = groupRep.startsWith(deptPrefix) ? groupRep : coreqCode;
          courseToGroupRep.set(coreqCode, finalGroupRep);
          
          // Also create a node for the coreq if needed
          if (!nodes.has(finalGroupRep)) {
            nodes.set(finalGroupRep, {
              id: finalGroupRep,
              label: coreqCode,
              type: 'course-node',
              prereqs: [],
              coreqs: [],
              coreqOrs: [],
            });
          }
        }
        
        const coreqGroup = courseToGroupRep.get(coreqCode);
        if (coreqGroup && coreqGroup !== courseGroup) {
          if (!coreqEdges.has(courseGroup)) coreqEdges.set(courseGroup, new Set<string>());
          coreqEdges.get(courseGroup)?.add(coreqGroup);
          
          // Remove from prerequisite edges if it exists there (coreqs shouldn't also be prereqs)
          edges.get(coreqGroup)?.delete(courseGroup);
          edges.get(courseGroup)?.delete(coreqGroup);
        }
      });
      
      // Extract direct AND children to mark their edges as protected from redundant removal
      if (courseData.rawPrereq.type === 'AND') {
        (courseData.rawPrereq.children || []).forEach((child: any) => {
          if (child.type === 'course' && child.code.startsWith(deptPrefix)) {
            const prereqGroup = courseToGroupRep.get(child.code) || child.code;
            const edgeKey = `${prereqGroup}->${courseGroup}`;
            protectedEdges.add(edgeKey);
          }
        });
      }
      
      // Extract prerequisites for layout (COREQ nodes are now skipped by buildLogicTree)
      const rootPrereqs = buildLogicTree(courseData.rawPrereq, courseGroup, courseLevel, false);
      const uniqueRootPrereqs = Array.from(new Set(rootPrereqs));
      
      uniqueRootPrereqs.forEach(prereqGroup => {
        if (courseGroup !== prereqGroup) {
          const edgeKey = `${prereqGroup}->${courseGroup}`;
          if (!edgeSet.has(edgeKey)) {
            edgeSet.add(edgeKey);
            if (!edges.has(prereqGroup)) edges.set(prereqGroup, new Set<string>());
            edges.get(prereqGroup)?.add(courseGroup);
          }
        }
      });

      // Extract local ORs for the tooltip
      const extractLocalOrs = (n: any): string[] => {
        if (!n) return [];
        const results: string[] = [];
        function traverse(node: any, depth = 0) {
          if (!node) return;
          
          if (node.type === 'COREQ') {
            const coursesStr = extractCoursesFromPrereq(node)
              .filter(c => c.startsWith(deptPrefix))
              .map(c => courseToGroupRep.get(c) || c);
            const uniqueCourses = Array.from(new Set(coursesStr));
            if (uniqueCourses.length > 0) {
              results.push(`(COREQ) ${uniqueCourses.join(', ')}`);
            }
            return;
          }
          
          if (node.type === 'count') {
            const coursesStr = extractCoursesFromPrereq(node)
              .filter(c => c.startsWith(deptPrefix))
              .map(c => courseToGroupRep.get(c) || c);
            const uniqueCourses = Array.from(new Set(coursesStr));
            if (uniqueCourses.length > 0) {
              results.push(`(${node.count} OF) ${uniqueCourses.join(', ')}`);
            }
            return; // don't traverse children further
          }
          
          if (node.type === 'AND') {
            // For AND nodes, extract direct course children and traverse for nested structures
            const directCourses: string[] = [];
            (node.children || []).forEach((child: any) => {
              if (child.type === 'course') {
                const courseCode = child.code;
                if (courseCode.startsWith(deptPrefix)) {
                  const mapped = courseToGroupRep.get(courseCode) || courseCode;
                  directCourses.push(mapped);
                }
              } else {
                // Traverse nested nodes (count, OR, etc.)
                traverse(child, depth + 1);
              }
            });
            // Add each direct course as a separate item
            directCourses.forEach(course => results.push(course));
            return;
          }
          
          if (node.type === 'OR') {
            const branches: string[] = [];
            (node.children || []).forEach((child: any) => {
              // For AND children, group courses with "AND"
              // For single courses or OR children, handle normally
              if (child.type === 'AND') {
                const coursesStr = extractCoursesFromPrereq(child)
                  .filter(c => c.startsWith(deptPrefix))
                  .map(c => courseToGroupRep.get(c) || c);
                const uniqueCourses = Array.from(new Set(coursesStr));
                if (uniqueCourses.length > 0) {
                  branches.push(`(${uniqueCourses.join(' AND ')})`);
                }
              } else {
                const coursesStr = extractCoursesFromPrereq(child)
                  .filter(c => c.startsWith(deptPrefix))
                  .map(c => courseToGroupRep.get(c) || c);
                const uniqueCourses = Array.from(new Set(coursesStr));
                if (uniqueCourses.length > 0) {
                  branches.push(uniqueCourses.length > 1 ? `(${uniqueCourses.join(' AND ')})` : uniqueCourses[0]);
                }
              }
            });
            const uniqueBranches = Array.from(new Set(branches));
            if (uniqueBranches.length > 1) {
              results.push(uniqueBranches.join(' OR '));
            } else if (uniqueBranches.length === 1) {
              // Single branch, just add it
              results.push(uniqueBranches[0]);
            }
            return; // don't traverse further after processing OR
          }

          if (node.type === 'NOT') {
            // Show as a labeled exclusion in the popup but don't add visual tree edges.
            const coursesStr = extractCoursesFromPrereq(node.children?.[0])
              .filter(c => c.startsWith(deptPrefix))
              .map(c => courseToGroupRep.get(c) || c);
            const uniqueCourses = Array.from(new Set(coursesStr));
            if (uniqueCourses.length > 0) {
              results.push(`NOT: ${uniqueCourses.join(' OR ')}`);
            } else {
              results.push('NOT');
            }
            return; // don't traverse further
          }

          // Traverse children for other node types
          if (node.children) {
            (node.children || []).forEach((child: any) => traverse(child, depth + 1));
          }
        }
        traverse(n);
        return Array.from(new Set(results));
      };

      const localOrs = extractLocalOrs(courseData.rawPrereq);
      if (localOrs.length > 0) {
        const nodeData = nodes.get(courseGroup);
        if (nodeData) {
          nodeData.departmentOrs = localOrs;
        }
      }

      // Extract OR logic from corequisites
      const extractLocalCoreqOrs = (node: any): string[] => {
        const results: string[] = [];
        const traverse = (n: any, depth: number) => {
          if (depth > 10) return; // Prevent infinite recursion
          
          if (n.type === 'COREQ') {
            // Process children of COREQ to find OR patterns
            const coreqChildren = n.children || [];
            
            // Look for OR patterns within COREQ
            const processChild = (child: any): string[] => {
              if (child.type === 'OR') {
                const branches: string[] = [];
                (child.children || []).forEach((c: any) => {
                  if (c.type === 'course') {
                    const code = c.code;
                    if (code.startsWith(deptPrefix)) {
                      const mapped = courseToGroupRep.get(code) || code;
                      branches.push(mapped);
                    }
                  } else if (c.type === 'AND') {
                    const coursesStr = extractCoursesFromPrereq(c)
                      .filter((cc: string) => cc.startsWith(deptPrefix))
                      .map((cc: string) => courseToGroupRep.get(cc) || cc);
                    const uniqueCourses = Array.from(new Set(coursesStr));
                    if (uniqueCourses.length > 0) {
                      branches.push(`(${uniqueCourses.join(' AND ')})`);
                    }
                  }
                });
                const uniqueBranches = Array.from(new Set(branches));
                if (uniqueBranches.length > 1) {
                  return [uniqueBranches.join(' OR ')];
                } else if (uniqueBranches.length === 1) {
                  return [uniqueBranches[0]];
                }
              } else if (child.type === 'AND') {
                const coursesStr = extractCoursesFromPrereq(child)
                  .filter((cc: string) => cc.startsWith(deptPrefix))
                  .map((cc: string) => courseToGroupRep.get(cc) || cc);
                const uniqueCourses = Array.from(new Set(coursesStr));
                if (uniqueCourses.length > 0) {
                  return [uniqueCourses.length > 1 ? `(${uniqueCourses.join(' AND ')})` : uniqueCourses[0]];
                }
              } else if (child.type === 'course') {
                const code = child.code;
                if (code.startsWith(deptPrefix)) {
                  const mapped = courseToGroupRep.get(code) || code;
                  return [mapped];
                }
              }
              return [];
            };
            
            coreqChildren.forEach((child: any) => {
              results.push(...processChild(child));
            });
          } else if (n.type === 'AND' || n.type === 'OR') {
            (n.children || []).forEach((child: any) => traverse(child, depth + 1));
          }
        };
        traverse(node, 0);
        return Array.from(new Set(results));
      };

      const coreqOrs = extractLocalCoreqOrs(courseData.rawPrereq);
      if (coreqOrs.length > 0) {
        const nodeData = nodes.get(courseGroup);
        if (nodeData) {
          nodeData.coreqOrs = coreqOrs;
        }
      }
    }
    
    courseData.coreqs.forEach(coreq => {
      // Intentionally omitting coreq edges from visualization per user request
    });
  });
  
  // Step 5: Resolve circular/bidirectional edges and all general cycles
  // Helper to get numeric suffix from course code (e.g., "CS 3100" -> 3100)
  const getCourseNumber = (courseId: string): number => {
    const match = courseId.match(/\d+$/);
    if (match) {
      return parseInt(match[0]);
    }
    return 0;
  };
  
  // Create a proper directed acyclic graph by breaking ALL cycles
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const edgesToRemoveAll: [string, string][] = [];
  
  // Sort the outgoing edges to prefer keeping edges to larger course numbers
  edges.forEach((children, parentId) => {
    const sorted = Array.from(children).sort((a, b) => getCourseNumber(a) - getCourseNumber(b));
    edges.set(parentId, new Set(sorted));
  });
  
  // Start DFS traversal from numerically lower courses to higher courses
  const sortedNodes = Array.from(nodes.keys()).sort((a, b) => getCourseNumber(a) - getCourseNumber(b));
  
  function dfsBreakCycles(nodeId: string) {
    visited.add(nodeId);
    recStack.add(nodeId);
    
    const children = edges.get(nodeId);
    if (children) {
      const childrenArray = Array.from(children);
      for (const childId of childrenArray) {
        if (!visited.has(childId)) {
          dfsBreakCycles(childId);
        } else if (recStack.has(childId)) {
          // Cycle detected! The edge nodeId -> childId is a back-edge
          // Rather than keeping a backwards edge, we remove it.
          edgesToRemoveAll.push([nodeId, childId]);
        }
      }
    }
    recStack.delete(nodeId);
  }
  
  sortedNodes.forEach(nodeId => {
    if (!visited.has(nodeId)) {
      dfsBreakCycles(nodeId);
    }
  });
  
  edgesToRemoveAll.forEach(([from, to]) => {
    edges.get(from)?.delete(to);
  });
  
  // Step 5b: Remove redundant edges
  // Step 6: Remove redundant edges
  const redundantEdges: [string, string][] = [];
  
  edges.forEach((children, parentId) => {
    const childArray = Array.from(children);
    
    childArray.forEach(childId => {
      childArray.forEach(otherChildId => {
        // Skip removing edges to logic nodes, as that breaks explicit AND/OR requirements
        const isLogicNode = nodes.get(otherChildId)?.type === 'or' || nodes.get(otherChildId)?.type === 'and';
        
        // Skip if this edge is from a direct AND prerequisite - these should never be removed
        const edgeKey = `${parentId}->${otherChildId}`;
        const isProtected = protectedEdges.has(edgeKey);
        
        if (!isLogicNode && !isProtected && childId !== otherChildId && hasPath(childId, otherChildId, edges)) {
          redundantEdges.push([parentId, otherChildId]);
        }
      });
    });
  });
  
  redundantEdges.forEach(([from, to]) => {
    edges.get(from)?.delete(to);
  });

  // Final cleanup: ensure no edge appears in both edges and coreqEdges
  coreqEdges.forEach((coreqChildren, parent) => {
    coreqChildren.forEach(child => {
      // Remove this coreq relationship from prerequisite edges (both directions)
      edges.get(parent)?.delete(child);
      edges.get(child)?.delete(parent);
    });
  });
  
  // Step 7: Remove isolated nodes (nodes with no incoming or outgoing edges)
  const nodesWithEdges = new Set<string>();
  
  // Add nodes that have outgoing edges (prerequisites or coreqs)
  edges.forEach((children, nodeId) => {
    if (children.size > 0) {
      nodesWithEdges.add(nodeId);
    }
  });
  
  coreqEdges.forEach((children, nodeId) => {
    if (children.size > 0) {
      nodesWithEdges.add(nodeId);
    }
  });
  
  // Add nodes that have incoming edges (prerequisites or coreqs)
  edges.forEach((children) => {
    children.forEach(childId => {
      nodesWithEdges.add(childId);
    });
  });
  
  coreqEdges.forEach((children) => {
    children.forEach(childId => {
      nodesWithEdges.add(childId);
    });
  });
  
  // Remove isolated nodes
  const removedNodes: string[] = [];
  nodes.forEach((_, nodeId) => {
    if (!nodesWithEdges.has(nodeId)) {
      nodes.delete(nodeId);
      removedNodes.push(nodeId);
    }
  });
  

  
  return { nodes, edges, coreqEdges };
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
