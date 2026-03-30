"use client";

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { CustomDropdown, CustomDropdownContent, CustomDropdownItem } from '../components/CustomDropdown';
import { getCourseInfoFromJSON } from '../actions';

interface CourseInfo {
  courseCode: string;
  title: string | null;
  description: string | null;
  prerequisites: string[];
  corequisites: string[];
  otherRequirements: string[];
  notRestrictions?: string[];
  enrollmentRestrictions?: string[];
  terms: string[];
}

type CourseOption = {
  code: string;
  title: string | null;
};

export default function CoursesPage() {
  const [allCourses, setAllCourses] = useState<CourseOption[]>([]);
  const [courseCode, setCourseCode] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCourseInfo, setSelectedCourseInfo] = useState<CourseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const loadCourses = async () => {
      try {
        const response = await fetch('/api/courses');
        const courses = await response.json();
        setAllCourses(courses.map((c: { id: string; title: string }) => ({
          code: c.id,
          title: c.title,
        })));
      } catch (error) {
        console.error('Failed to load courses:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCourses();
  }, []);

  const filteredCourses = courseCode
    ? allCourses
        .filter((course) =>
          course.code.toLowerCase().includes(courseCode.toLowerCase()) ||
          (course.title ?? '').toLowerCase().includes(courseCode.toLowerCase())
        )
        .sort((a, b) => {
          const lowerSearch = courseCode.toLowerCase();
          const aStartsWith = a.code.toLowerCase().startsWith(lowerSearch);
          const bStartsWith = b.code.toLowerCase().startsWith(lowerSearch);

          if (aStartsWith && !bStartsWith) return -1;
          if (!aStartsWith && bStartsWith) return 1;

          return a.code.localeCompare(b.code);
        })
    : [];

  const handleCourseSearchChange = (value: string) => {
    setCourseCode(value);
    setShowDropdown(true);
  };

  const handleSelectCourse = async (code: string) => {
    setCourseCode(code);
    setShowDropdown(false);
    
    try {
      const info = await getCourseInfoFromJSON(code);
      setSelectedCourseInfo(info);
    } catch (error) {
      console.error('Failed to get course info:', error);
    }
  };

  const normalizeSearchCode = (value: string) => value.toUpperCase().replace(/\s+/g, ' ').trim();

  const handleSearchSubmit = async () => {
    const normalizedInput = normalizeSearchCode(courseCode);
    if (!normalizedInput) return;

    const exactMatch = allCourses.find((course) => normalizeSearchCode(course.code) === normalizedInput);
    const fallbackMatch = filteredCourses[0];
    const target = exactMatch?.code ?? fallbackMatch?.code;

    if (target) {
      await handleSelectCourse(target);
    }
  };

  if (loading) {
    return (
      <div className="w-full pt-0 pb-6">
        <div className="mb-6 border-b border-panel-border pb-4">
          <h1 className="text-3xl font-bold text-heading">Course Search</h1>
        </div>
        <div className="text-center py-8 text-text-secondary">Loading courses...</div>
      </div>
    );
  }

  return (
    <div className="w-full pt-0 pb-6">
      <div className="mb-6 border-b border-panel-border pb-4">
        <h1 className="text-3xl font-bold text-heading">Course Search</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Search Panel */}
        <div className="lg:col-span-1">
          <div className="bg-panel-bg p-6 rounded-xl border border-panel-border">
            <label className="block text-sm font-semibold text-heading mb-3">Search Courses</label>
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Enter course code or name..."
                value={courseCode}
                onChange={(e) => handleCourseSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSearchSubmit();
                  }
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                className="w-full px-3 py-2.5 bg-panel-bg-alt border border-panel-border-strong rounded-xl text-sm text-text-primary focus:outline-none"
              />
              
              {showDropdown && filteredCourses.length > 0 && (
                <div className="absolute z-10 left-0 top-full w-full mt-1.5 bg-panel-bg border border-panel-border rounded-xl shadow-lg overflow-hidden">
                  <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
                    {filteredCourses.map((course) => (
                      <div
                        key={course.code}
                        className="px-3 py-2 rounded-xl hover:bg-hover-bg transition-colors cursor-pointer"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectCourse(course.code)}
                      >
                        <div className="text-sm font-medium text-text-primary">{course.code}</div>
                        {course.title && (
                          <div className="text-xs text-text-muted truncate">{course.title}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Course Details Panel */}
        <div className="lg:col-span-2">
          {selectedCourseInfo ? (
            <CourseDescriptionContent courseInfo={selectedCourseInfo} />
          ) : (
            <div className="bg-panel-bg p-6 rounded-xl border border-panel-border text-center py-12">
            <Icon name="book" color="currentColor" width={48} height={48} className="w-12 h-12 mx-auto mb-4 text-text-muted opacity-50" />
              <p className="text-text-secondary">Search for a course to view its details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface CourseDescriptionProps {
  courseInfo: CourseInfo | null;
}

function formatEnrollmentRequirement(requirement: string): { label: string; value: string } {
  const trimmed = requirement.trim();

  if (/^(?:Other Requirement:\s*)?instructor(?:'s)?\s+(?:permission|consent)\b/i.test(trimmed)) {
    return {
      label: 'Instructor Permission',
      value: 'Instructor Permission',
    };
  }

  const prefixMatch = trimmed.match(/^(Major Restriction|Program Restriction|Year Requirement|School Requirement|Credit Requirement|Other Requirement):\s*(.+)$/i);
  if (prefixMatch) {
    return {
      label: prefixMatch[1],
      value: prefixMatch[2],
    };
  }

  if (trimmed.includes(' OR ')) {
    return {
      label: 'One Of',
      value: trimmed,
    };
  }

  if (trimmed.includes(' AND ')) {
    return {
      label: 'All Of',
      value: trimmed,
    };
  }

  return {
    label: 'Course Requirement',
    value: trimmed,
  };
}

function CourseDescriptionContent({
  courseInfo,
}: CourseDescriptionProps) {
  if (!courseInfo) {
    return (
      <div className="bg-panel-bg p-6 rounded-xl border border-panel-border text-center py-12">
        <Icon name="book" color="currentColor" width={48} height={48} className="w-12 h-12 mx-auto mb-4 text-text-muted opacity-50" />
        <p className="text-text-secondary">Search for a course to view its details</p>
      </div>
    );
  }

  const notRestrictions = courseInfo.notRestrictions ?? courseInfo.enrollmentRestrictions ?? [];

  const RequirementCard = ({ requirement }: { requirement: string }) => {
    const formattedRequirement = formatEnrollmentRequirement(requirement);

    return (
      <div className="rounded-xl border border-panel-border bg-hover-bg/40 px-3 py-2">
        <div className="mb-1 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide bg-text-muted/10 text-text-secondary">
            {formattedRequirement.label}
          </span>
        </div>
        <p className="text-sm text-text-secondary leading-6">{formattedRequirement.value}</p>
      </div>
    );
  };

  return (
    <div className="bg-panel-bg p-6 rounded-xl border border-panel-border space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-heading">{courseInfo.courseCode}</h2>
        {courseInfo.title && (
          <p className="mt-1 text-sm text-text-secondary">{courseInfo.title}</p>
        )}
      </div>

      {courseInfo.description && (
        <div>
          <h3 className="font-semibold text-text-primary mb-2 border-b border-panel-border pb-2">
            Description
          </h3>
          <p className="text-sm text-text-secondary leading-6">{courseInfo.description}</p>
        </div>
      )}

      {(courseInfo.prerequisites.length > 0 ||
        courseInfo.corequisites.length > 0 ||
        courseInfo.otherRequirements.length > 0 ||
        notRestrictions.length > 0) && (
        <div>
          <h3 className="font-semibold text-text-primary mb-3 border-b border-panel-border pb-2">
            Requirements
          </h3>
          <div className="space-y-4">
            {courseInfo.prerequisites.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Prerequisites</h4>
                <div className="space-y-2">
                  {courseInfo.prerequisites.map((requirement, i) => (
                    <RequirementCard key={`prerequisite-${i}`} requirement={requirement} />
                  ))}
                </div>
              </div>
            )}

            {courseInfo.corequisites.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Corequisites</h4>
                <div className="space-y-2">
                  {courseInfo.corequisites.map((requirement, i) => (
                    <RequirementCard key={`corequisite-${i}`} requirement={requirement} />
                  ))}
                </div>
              </div>
            )}

            {courseInfo.otherRequirements.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Other Requirements</h4>
                <div className="space-y-2">
                  {courseInfo.otherRequirements.map((requirement, i) => (
                    <RequirementCard key={`other-requirement-${i}`} requirement={requirement} />
                  ))}
                </div>
              </div>
            )}

            {notRestrictions.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">NOT</h4>
                <div className="space-y-2">
                  {notRestrictions.map((requirement, i) => (
                    <RequirementCard key={`not-restriction-${i}`} requirement={requirement} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {courseInfo.terms.length > 0 && (
        <div>
          <h3 className="font-semibold text-text-primary mb-2 border-b border-panel-border pb-2">
            Available Terms
          </h3>
          <div className="flex flex-wrap gap-2">
            {courseInfo.terms.map((term, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-full border border-panel-border-strong px-2.5 py-1 text-xs font-medium text-text-secondary"
              >
                {term}
              </span>
            ))}
          </div>
        </div>
      )}

      {!courseInfo.title &&
        !courseInfo.description &&
        courseInfo.prerequisites.length === 0 &&
        courseInfo.corequisites.length === 0 &&
        courseInfo.otherRequirements.length === 0 &&
        notRestrictions.length === 0 &&
        courseInfo.terms.length === 0 && (
          <p className="text-gray-500 italic text-sm">
            No course details were found for this course in the current catalog data.
          </p>
        )}
    </div>
  );
}
