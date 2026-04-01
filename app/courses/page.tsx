"use client";

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from '../components/DropdownMenu';
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
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isHoveringInfo, setIsHoveringInfo] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const infoButtonRef = useRef<HTMLButtonElement | null>(null);

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

  // Close info tooltip when clicking outside (mobile only) or when unhover (desktop)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const isClickInsideInfoButton = infoButtonRef.current && infoButtonRef.current.contains(e.target as Node);
      
      if (!isClickInsideInfoButton && !isDesktop) {
        setShowInfoTooltip(false);
      }
    };

    if (showInfoTooltip && !isDesktop) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showInfoTooltip, isDesktop]);

  // Detect if user is on desktop (lg breakpoint and above - matches Sidebar's lg:hidden threshold)
  useEffect(() => {
    const checkIsDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    
    checkIsDesktop();
    window.addEventListener("resize", checkIsDesktop);
    return () => {
      window.removeEventListener("resize", checkIsDesktop);
    };
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

  // Handle info tooltip visibility based on device
  const handleInfoMouseEnter = () => {
    if (isDesktop) {
      setIsHoveringInfo(true);
      setShowInfoTooltip(true);
    }
  };

  const handleInfoMouseLeave = () => {
    if (isDesktop) {
      setIsHoveringInfo(false);
      setShowInfoTooltip(false);
    }
  };

  const handleInfoClick = () => {
    if (!isDesktop) {
      setShowInfoTooltip(!showInfoTooltip);
    }
  };

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
            <DropdownMenu
              isOpen={showDropdown && filteredCourses.length > 0 && courseCode.trim().length > 0}
              onOpenChange={setShowDropdown}
              className="w-full"
              trigger={
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Enter course code or name..."
                  value={courseCode}
                  onChange={(e) => {
                    handleCourseSearchChange(e.target.value);
                    setShowDropdown(true);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (filteredCourses.length > 0 && courseCode.trim().length > 0) {
                      setShowDropdown(true);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleSearchSubmit();
                      setShowDropdown(false);
                    }
                  }}
                  className="w-full px-3 py-2 bg-panel-bg-alt border border-panel-border-strong rounded-xl text-sm text-text-primary outline-none transition-colors"
                />
              }
            >
              <DropdownMenuContent maxHeight="max-h-64">
                {filteredCourses.map((course) => (
                  <DropdownMenuItem
                    key={course.code}
                    onClick={() => {
                      handleSelectCourse(course.code);
                      setShowDropdown(false);
                    }}
                    description={course.title}
                  >
                    {course.code}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Course Details Panel */}
        <div className="lg:col-span-2">
          {selectedCourseInfo ? (
            <CourseDescriptionContent 
              courseInfo={selectedCourseInfo}
              showInfoTooltip={showInfoTooltip}
              infoButtonRef={infoButtonRef}
              onInfoClick={handleInfoClick}
              onInfoMouseEnter={handleInfoMouseEnter}
              onInfoMouseLeave={handleInfoMouseLeave}
            />
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
  showInfoTooltip: boolean;
  infoButtonRef: React.RefObject<HTMLButtonElement | null>;
  onInfoClick: () => void;
  onInfoMouseEnter: () => void;
  onInfoMouseLeave: () => void;
}

function formatEnrollmentRequirement(requirement: string): { label: string; value: string } {
  const trimmed = requirement.trim();

  if (/^NOT\s*\(/i.test(trimmed)) {
    // Extract content inside NOT(...) and remove the wrapping parens
    const contentMatch = trimmed.match(/^NOT\s*\(\s*(.*?)\s*\)$/i);
    const content = contentMatch ? contentMatch[1] : trimmed.replace(/^NOT\s*\(\s*|\s*\)$/gi, '');
    return {
      label: 'NOT',
      value: content,
    };
  }

  if (/^Concurrent:\s+/i.test(trimmed)) {
    // Extract content after "Concurrent: "
    const content = trimmed.replace(/^Concurrent:\s+/i, '');
    return {
      label: 'Concurrent',
      value: content,
    };
  }

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
  showInfoTooltip,
  infoButtonRef,
  onInfoClick,
  onInfoMouseEnter,
  onInfoMouseLeave,
}: CourseDescriptionProps) {
  if (!courseInfo) {
    return (
      <div className="bg-panel-bg p-6 rounded-xl border border-panel-border text-center py-12">
        <Icon name="book" color="currentColor" width={48} height={48} className="w-12 h-12 mx-auto mb-4 text-text-muted opacity-50" />
        <p className="text-text-secondary">Search for a course to view its details</p>
      </div>
    );
  }

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
        courseInfo.otherRequirements.length > 0) && (
        <div>
          <div className="mb-3 border-b border-panel-border pb-2">
            <div className="inline-flex items-start gap-1">
              <h3 className="font-semibold text-text-primary">
                Enrollment Requirements
              </h3>
              <div className="relative w-4 h-4 mt-0.5">
                <button
                  ref={infoButtonRef}
                  onClick={onInfoClick}
                  onMouseEnter={onInfoMouseEnter}
                  onMouseLeave={onInfoMouseLeave}
                  className="w-4 h-4 flex items-center justify-center text-text-tertiary hover:text-text-secondary focus:text-text-secondary transition-colors cursor-help flex-shrink-0"
                  aria-label="Information about enrollment requirements data"
                >
                  <Icon 
                    name="info"
                    color="currentColor"
                    width={16}
                    height={16}
                  />
                </button>
                {showInfoTooltip && (
                  <div className="absolute left-1/2 -translate-x-1/2 top-full w-52 mt-2 p-2 bg-panel-bg border border-panel-border rounded-lg text-xs text-text-secondary shadow-lg z-50 whitespace-normal">
                    This data is parsed from SIS and may contain errors.
                  </div>
                )}
              </div>
            </div>
          </div>
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
        courseInfo.terms.length === 0 && (
          <p className="text-gray-500 italic text-sm">
            No course details were found for this course in the current catalog data.
          </p>
        )}
    </div>
  );
}
