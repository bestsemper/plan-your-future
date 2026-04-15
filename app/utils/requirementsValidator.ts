import type { Requirement } from './types';

export interface RequirementCheckResult {
  requirement: Requirement;
  satisfied: boolean;
  percentage: number; // 0-1
  matchedChildren: RequirementCheckResult[];
  matchedCourses: string[]; // course codes that matched
  courseSuggestions?: string[]; // suggested courses to satisfy unsatisfied requirements
  units?: number; // cumulative units from matched courses
  minUnitsNeeded?: number; // minimum units required (from constraints)
}

/**
 * Check if a single constraint is satisfied by the taken courses
 */
function checkConstraint(
  constraint: any,
  takenCourses: Set<string>
): boolean {
  if (!constraint) return true;

  switch (constraint.type) {
    case 'none':
      return true;

    case 'course_list':
      // At least one course from the list must be taken
      return constraint.courses?.some((code: string) => takenCourses.has(code)) ?? false;

    case 'course_set':
      // At least one course from the set must be taken
      return constraint.courses?.some((code: string) => takenCourses.has(code)) ?? false;

    case 'min_courses':
      // Count how many courses from constraint.courses are taken
      const count = constraint.courses?.filter((code: string) => takenCourses.has(code)).length ?? 0;
      return count >= constraint.value;

    case 'min_units':
      // For now, we don't track units, so we'll skip this
      return true;

    case 'max_units':
      return true;

    case 'exact_units':
      return true;

    case 'text':
    case 'fulfill_all':
    case 'fulfill_any':
      return true;

    default:
      return true;
  }
}

/**
 * Check a requirement and all its children against taken courses
 */
export function checkRequirement(
  requirement: Requirement,
  takenCourses: Set<string>
): RequirementCheckResult {
  const matchedCourses: string[] = [];
  
  // Check all constraints
  const constraintsSatisfied = requirement.constraints?.every((c: any) =>
    checkConstraint(c, takenCourses)
  ) ?? true;

  // Check children recursively
  const matchedChildren: RequirementCheckResult[] = requirement.children
    .map((child: Requirement) => checkRequirement(child, takenCourses))
    .filter((result: RequirementCheckResult) => result.satisfied || result.matchedCourses.length > 0);

  // Collect matched courses from this requirement and children
  if (constraintsSatisfied) {
    // Check if this is a leaf node (course) by looking at whether it has constraints with course lists
    requirement.constraints?.forEach((constraint: any) => {
      if (constraint.type === 'course_list' || constraint.type === 'course_set') {
        constraint.courses?.forEach((code: string) => {
          if (takenCourses.has(code)) {
            matchedCourses.push(code);
          }
        });
      }
    });
  }

  // Collect from children too
  matchedChildren.forEach((child) => {
    matchedCourses.push(...child.matchedCourses);
  });

  // Determine if satisfied
  const satisfied = constraintsSatisfied && matchedChildren.every((c: RequirementCheckResult) => c.satisfied);
  const percentage =
    matchedChildren.length > 0
      ? matchedChildren.filter((c: RequirementCheckResult) => c.satisfied).length / matchedChildren.length
      : satisfied
        ? 1
        : 0;

  return {
    requirement,
    satisfied,
    percentage,
    matchedChildren,
    matchedCourses: [...new Set(matchedCourses)], // deduplicate
  };
}
