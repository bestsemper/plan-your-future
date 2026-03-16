"use client";

import { useEffect, useRef, useState } from 'react';
import { CustomDropdown, CustomDropdownContent, CustomDropdownItem } from '../components/CustomDropdown';
import { getCourseInfoFromCSV, getCourseCreditsFromCSV } from '../actions';

interface CourseInfo {
  courseCode: string;
  title: string | null;
  description: string | null;
  prerequisites: string[];
  corequisites: string[];
  otherRequirements: string[];
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
      const info = await getCourseInfoFromCSV(code);
      setSelectedCourseInfo(info);
    } catch (error) {
      console.error('Failed to get course info:', error);
    }
  };

  const handleRequirementClick = async (requirement: string) => {
    const courseCodeMatch = requirement.match(/([A-Z]{2,6}\s\d{4}[A-Z]?)/);
    if (courseCodeMatch) {
      const code = courseCodeMatch[1];
      await handleSelectCourse(code);
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
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
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                className="w-full px-3 py-2.5 bg-panel-bg-alt border border-panel-border-strong rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-uva-blue/30"
              />
              
              {showDropdown && filteredCourses.length > 0 && (
                <div className="absolute z-10 left-0 top-full w-full mt-1.5 bg-panel-bg border border-panel-border rounded-lg shadow-lg overflow-hidden">
                  <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
                    {filteredCourses.map((course) => (
                      <div
                        key={course.code}
                        className="px-3 py-2 rounded-lg hover:bg-hover-bg transition-colors cursor-pointer"
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
            <CourseDescriptionContent courseInfo={selectedCourseInfo} onRequirementClick={handleRequirementClick} />
          ) : (
            <div className="bg-panel-bg p-6 rounded-xl border border-panel-border text-center py-12">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-12 h-12 mx-auto mb-4 text-text-muted opacity-50"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
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
  onRequirementClick?: (requirement: string) => void;
}

function CourseDescriptionContent({
  courseInfo,
  onRequirementClick,
}: CourseDescriptionProps) {
  if (!courseInfo) {
    return (
      <div className="bg-panel-bg p-6 rounded-xl border border-panel-border text-center py-12">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-12 h-12 mx-auto mb-4 text-text-muted opacity-50"
        >
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <p className="text-text-secondary">Search for a course to view its details</p>
      </div>
    );
  }

  const handleRequirementClick = (requirement: string) => {
    if (onRequirementClick) {
      onRequirementClick(requirement);
    }
  };

  const RequirementItem = ({ requirement }: { requirement: string }) => (
    <li
      className="text-sm text-text-secondary bg-panel-bg-alt px-3 py-2 rounded-lg hover:bg-hover-bg transition-colors cursor-pointer"
      onClick={() => handleRequirementClick(requirement)}
    >
      {requirement}
    </li>
  );

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
          <h3 className="font-semibold text-text-primary mb-3 border-b border-panel-border pb-2">
            Requirements
          </h3>
          <div className="space-y-4">
            {courseInfo.prerequisites.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-text-primary mb-2">Prerequisites</h4>
                <ul className="space-y-1">
                  {courseInfo.prerequisites.map((requirement, i) => (
                    <RequirementItem key={`prerequisite-${i}`} requirement={requirement} />
                  ))}
                </ul>
              </div>
            )}

            {courseInfo.corequisites.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-text-primary mb-2">Corequisites</h4>
                <ul className="space-y-1">
                  {courseInfo.corequisites.map((requirement, i) => (
                    <RequirementItem key={`corequisite-${i}`} requirement={requirement} />
                  ))}
                </ul>
              </div>
            )}

            {courseInfo.otherRequirements.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-text-primary mb-2">Other Requirements</h4>
                <ul className="space-y-1">
                  {courseInfo.otherRequirements.map((requirement, i) => (
                    <RequirementItem key={`other-requirement-${i}`} requirement={requirement} />
                  ))}
                </ul>
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
