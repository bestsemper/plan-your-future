"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from '../components/DropdownMenu';
import { addCourseToSemester, getCourseInfoFromJSON, getPlanBuilderData } from '../actions';

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
  credits?: string;
  creditsMin?: number;
  creditsMax?: number;
}

type CourseOption = {
  code: string;
  title: string | null;
  credits?: string;
  creditsMin?: number;
  creditsMax?: number;
  department?: string;
  career?: string;
  terms?: string[];
};

type PlanSemester = { id: string; termName: string; termOrder: number; year: number; };
type PlanOption = { id: string; title: string; semesters: PlanSemester[]; };

export default function CoursesPage() {
  const [allCourses, setAllCourses] = useState<CourseOption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [courseCode, setCourseCode] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCourseInfo, setSelectedCourseInfo] = useState<CourseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isHoveringInfo, setIsHoveringInfo] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const infoButtonRef = useRef<HTMLButtonElement | null>(null);
  
  // Department mapping state
  const [departmentMap, setDepartmentMap] = useState<Map<string, string>>(new Map());
  
  // Filter states
  const [filterDepartment, setFilterDepartment] = useState<string>('');
  const [filterMinCredits, setFilterMinCredits] = useState<number | ''>('');
  const [filterMaxCredits, setFilterMaxCredits] = useState<number | ''>('');
  const [filterTerm, setFilterTerm] = useState<string>('');
  const [filterCareer, setFilterCareer] = useState<string>('');
  
  // Filter dropdown open states
  const [isDepartmentOpen, setIsDepartmentOpen] = useState(false);
  const [isDepartmentSearching, setIsDepartmentSearching] = useState(false);
  const [isTermOpen, setIsTermOpen] = useState(false);
  const [isCareerOpen, setIsCareerOpen] = useState(false);
  const [departmentSearch, setDepartmentSearch] = useState('');

  // Get unique departments from courses
  const uniqueDepartments = useMemo(() => {
    return Array.from(
      new Set(allCourses
        .map(c => c.department)
        .filter((dept): dept is string => Boolean(dept))
      )
    ).sort();
  }, [allCourses]);

  // Filter departments for search
  const filteredDepartmentsForSearch = useMemo(() => {
    return uniqueDepartments.filter(dept =>
      !departmentSearch || dept.toLowerCase().includes(departmentSearch.toLowerCase()) || (departmentMap.get(dept) || '').toLowerCase().includes(departmentSearch.toLowerCase())
    );
  }, [uniqueDepartments, departmentSearch, departmentMap]);

  useEffect(() => {
    const loadCoursesAndDepartments = async () => {
      try {
        // Load department mappings
        const deptsResponse = await fetch('/api/tree/departments');
        const depts = await deptsResponse.json();
        const deptMap = new Map<string, string>(depts.map((d: any) => [d.mnemonic as string, d.fullName as string]));
        setDepartmentMap(deptMap);

        // Load courses
        const response = await fetch('/api/courses');
        const courses = await response.json();
        setAllCourses(courses.map((c: any) => ({
          code: c.id,
          title: c.title,
          credits: c.credits,
          creditsMin: c.creditsMin,
          creditsMax: c.creditsMax,
          department: c.department,
          career: c.career,
          terms: c.terms,
        })));

        // Load user plans for "Add to Plan" feature
        const planData = await getPlanBuilderData();
        if (!('error' in planData)) {
          setPlans(planData.plans.map((p) => ({
            id: p.id,
            title: p.title,
            semesters: p.semesters,
          })));
        }
      } catch (error) {
        console.error('Failed to load courses:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCoursesAndDepartments();
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

  const filteredCourses = allCourses
    .filter((course) => {
      if (!course.code) return false;
      
      // Search filter
      if (courseCode) {
        const matchesSearch = course.code.toLowerCase().includes(courseCode.toLowerCase()) ||
          (course.title ?? '').toLowerCase().includes(courseCode.toLowerCase());
        if (!matchesSearch) return false;
      }

      // Department filter
      if (filterDepartment && course.department !== filterDepartment) {
        return false;
      }

      // Credits filters
      if (filterMinCredits !== '' && course.creditsMax && course.creditsMax < filterMinCredits) {
        return false;
      }
      if (filterMaxCredits !== '' && course.creditsMin && course.creditsMin > filterMaxCredits) {
        return false;
      }

      // Term filter
      if (filterTerm && course.terms && !course.terms.some(t => t.includes(filterTerm))) {
        return false;
      }

      // Career level filter
      if (filterCareer && course.career !== filterCareer) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      // Sort by search relevance on code first, then alphabetically
      if (courseCode) {
        const lowerSearch = courseCode.toLowerCase();
        const aStartsWith = (a.code || '').toLowerCase().startsWith(lowerSearch);
        const bStartsWith = (b.code || '').toLowerCase().startsWith(lowerSearch);

        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
      }

      return (a.code || '').localeCompare(b.code || '');
    });

  const handleCourseSearchChange = (value: string) => {
    setCourseCode(value);
    setShowDropdown(true);
  };

  const handleSelectCourse = async (code: string) => {
    setCourseCode(code);
    setShowDropdown(false);
    window.dispatchEvent(new CustomEvent("tutorial:step-event", { detail: { name: "courseSearchSelected" } }));

    try {
      const baseInfo = await getCourseInfoFromJSON(code);
      const info: CourseInfo = {
        ...baseInfo,
        credits: undefined,
        creditsMin: undefined,
        creditsMax: undefined,
      };
      
      // Enrich with credits and other metadata from allCourses
      const courseData = allCourses.find(c => c.code === code);
      if (courseData) {
        info.credits = courseData.credits;
        info.creditsMin = courseData.creditsMin;
        info.creditsMax = courseData.creditsMax;
      }
      
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
      <div className="w-full pt-0 pb-6 animate-pulse">
        <div className="mb-6 border-b border-panel-border pb-4">
          <div className="h-9 w-44 rounded bg-input-disabled" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: search + filters */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-panel-bg rounded-3xl border border-panel-border p-6 space-y-3">
              <div className="h-4 w-32 rounded bg-input-disabled" />
              <div className="h-10 w-full rounded-full bg-input-disabled" />
            </div>
            <div className="bg-panel-bg rounded-3xl border border-panel-border p-6 space-y-4">
              <div className="h-4 w-16 rounded bg-input-disabled" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 w-24 rounded bg-input-disabled" />
                  <div className="h-10 w-full rounded-full bg-input-disabled" />
                </div>
              ))}
            </div>
          </div>
          {/* Right: course detail placeholder */}
          <div className="lg:col-span-2">
            <div className="bg-panel-bg rounded-3xl border border-panel-border p-6 space-y-4">
              <div className="h-7 w-36 rounded bg-input-disabled" />
              <div className="h-4 w-52 rounded bg-input-disabled" />
              <div className="h-4 w-20 rounded bg-input-disabled" />
              <div className="pt-2 space-y-2">
                <div className="h-4 w-full rounded bg-input-disabled" />
                <div className="h-4 w-5/6 rounded bg-input-disabled" />
                <div className="h-4 w-4/5 rounded bg-input-disabled" />
                <div className="h-4 w-3/4 rounded bg-input-disabled" />
              </div>
            </div>
          </div>
        </div>
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
          <div className="bg-panel-bg p-6 rounded-3xl border border-panel-border" data-tutorial-target="courses-search-input">
            <label className="block text-sm font-semibold text-heading mb-3">Search Courses</label>
            <DropdownMenu
              isOpen={showDropdown && filteredCourses.length > 0}
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
                    if (filteredCourses.length > 0) {
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
                  className="w-full h-10 px-3 py-2 bg-input-bg border border-panel-border rounded-full text-sm text-text-primary outline-none transition-colors"
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
                    description={course.title || ''}
                  >
                    {course.code}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Filters Panel */}
          <div className="bg-panel-bg p-6 rounded-3xl border border-panel-border mt-4 space-y-4">
            <label className="block text-sm font-semibold text-heading">Filters</label>
            
            {/* Department Filter */}
            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">Department</label>
              {!isDepartmentSearching && filterDepartment ? (
                // Show selected department with clear button
                <div className="w-full h-10 px-4 py-2 border border-panel-border rounded-full bg-input-bg text-left cursor-pointer flex items-center justify-between gap-3 focus:outline-none hover:border-panel-border-strong transition-all relative"
                  data-tutorial-target="courses-department-filter"
                  onClick={() => setIsDepartmentSearching(true)}
                  role="button"
                  tabIndex={0}
                >
                  <span className="truncate flex-1 text-text-primary">{departmentMap.get(filterDepartment) || filterDepartment}</span>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilterDepartment('');
                      setDepartmentSearch('');
                      setIsDepartmentSearching(false);
                    }}
                    className="text-text-secondary hover:text-danger-text cursor-pointer flex items-center justify-center transition-all"
                    role="button"
                    tabIndex={-1}
                  >
                    <Icon
                      name="x"
                      color="currentColor"
                      width={16}
                      height={16}
                      className="w-4 h-4"
                    />
                  </div>
                </div>
              ) : isDepartmentSearching ? (
                // Show search input
                <DropdownMenu
                  isOpen={isDepartmentOpen && filteredDepartmentsForSearch.length > 0}
                  onOpenChange={setIsDepartmentOpen}
                  className="w-full"
                  trigger={
                    <input
                      data-tutorial-target="courses-department-filter"
                      type="text"
                      autoFocus
                      placeholder="Search departments..."
                      value={departmentSearch}
                      onChange={(e) => {
                        setDepartmentSearch(e.target.value);
                        setIsDepartmentOpen(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (filteredDepartmentsForSearch.length > 0) {
                            setFilterDepartment(filteredDepartmentsForSearch[0]);
                            setIsDepartmentOpen(false);
                            setDepartmentSearch('');
                            setIsDepartmentSearching(false);
                          }
                        }
                      }}
                      onClick={() => setIsDepartmentOpen(true)}
                      onBlur={() => {
                        setTimeout(() => {
                          if (!departmentSearch) {
                            setIsDepartmentSearching(false);
                          }
                          setIsDepartmentOpen(false);
                        }, 100);
                      }}
                      className="w-full h-10 px-3 py-2 bg-input-bg border border-panel-border rounded-full text-sm text-text-primary placeholder:text-text-tertiary placeholder:text-sm outline-none transition-colors"
                    />
                  }
                >
                  <DropdownMenuContent maxHeight="max-h-64">
                    {filteredDepartmentsForSearch.map((dept) => (
                      <DropdownMenuItem
                        key={dept}
                        onClick={() => {
                          setFilterDepartment(dept);
                          setIsDepartmentOpen(false);
                          setDepartmentSearch('');
                          setIsDepartmentSearching(false);
                        }}
                        selected={filterDepartment === dept}
                        description={dept}
                      >
                        {departmentMap.get(dept) || dept}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                // Show select button
                <button
                  data-tutorial-target="courses-department-filter"
                  type="button"
                  onClick={() => {
                    setIsDepartmentSearching(true);
                    setIsDepartmentOpen(true);
                  }}
                  className="w-full h-10 px-4 py-2 border border-panel-border rounded-full bg-input-bg text-text-tertiary text-left cursor-pointer flex items-center justify-between gap-3 focus:outline-none hover:border-panel-border-strong transition-all"
                >
                  <span className="truncate text-sm">Select Department</span>
                  <Icon name="chevron-down" color="currentColor" width={16} height={16} className="w-4 h-4 shrink-0 text-text-secondary" />
                </button>
              )}
            </div>

            {/* Term Filter */}
            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">Term</label>
              <DropdownMenu
                isOpen={isTermOpen}
                onOpenChange={setIsTermOpen}
                className="w-full"
                trigger={
                  <button
                    data-tutorial-target="courses-term-filter"
                    type="button"
                    className="w-full h-10 px-4 py-2 border border-panel-border rounded-full bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between gap-3 focus:outline-none hover:border-panel-border-strong transition-all"
                  >
                    <span className={filterTerm ? 'truncate' : 'truncate text-text-tertiary text-sm'}>
                      {filterTerm || 'All Terms'}
                    </span>
                    <Icon name="chevron-down" color="currentColor" width={16} height={16} className="w-4 h-4 shrink-0 text-text-secondary" />
                  </button>
                }
              >
                <DropdownMenuContent maxHeight="max-h-64">
                  <DropdownMenuItem
                    onClick={() => {
                      setFilterTerm('');
                      setIsTermOpen(false);
                    }}
                    selected={filterTerm === ''}
                  >
                    All Terms
                  </DropdownMenuItem>
                  {['Fall', 'Winter', 'Spring', 'Summer'].map((term) => (
                    <DropdownMenuItem
                      key={term}
                      onClick={() => {
                        setFilterTerm(term);
                        setIsTermOpen(false);
                      }}
                      selected={filterTerm === term}
                    >
                      {term}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Career Level Filter */}
            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">Level</label>
              <DropdownMenu
                isOpen={isCareerOpen}
                onOpenChange={setIsCareerOpen}
                className="w-full"
                trigger={
                  <button type="button" className="w-full h-10 px-4 py-2 border border-panel-border rounded-full bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between gap-3 focus:outline-none hover:border-panel-border-strong transition-all">
                    <span className={filterCareer ? 'truncate' : 'truncate text-text-tertiary text-sm'}>
                      {filterCareer === 'UGRD' ? 'Undergraduate' : filterCareer === 'GRAD' ? 'Graduate' : 'All Levels'}
                    </span>
                    <Icon name="chevron-down" color="currentColor" width={16} height={16} className="w-4 h-4 shrink-0 text-text-secondary" />
                  </button>
                }
              >
                <DropdownMenuContent maxHeight="max-h-64">
                  <DropdownMenuItem
                    onClick={() => {
                      setFilterCareer('');
                      setIsCareerOpen(false);
                    }}
                    selected={filterCareer === ''}
                  >
                    All Levels
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setFilterCareer('UGRD');
                      setIsCareerOpen(false);
                    }}
                    selected={filterCareer === 'UGRD'}
                  >
                    Undergraduate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setFilterCareer('GRAD');
                      setIsCareerOpen(false);
                    }}
                    selected={filterCareer === 'GRAD'}
                  >
                    Graduate
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Course Details Panel */}
        <div className="lg:col-span-2">
          {selectedCourseInfo ? (
            <CourseDescriptionContent
              courseInfo={selectedCourseInfo}
              plans={plans}
              showInfoTooltip={showInfoTooltip}
              infoButtonRef={infoButtonRef}
              onInfoClick={handleInfoClick}
              onInfoMouseEnter={handleInfoMouseEnter}
              onInfoMouseLeave={handleInfoMouseLeave}
            />
          ) : (
            <div className="bg-panel-bg p-6 rounded-3xl border border-panel-border text-center py-12">
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
  plans: PlanOption[];
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

  if (/^\(\d+ OF\)/.test(trimmed)) {
    const match = trimmed.match(/^\((\d+) OF\)/);
    return {
      label: `${match?.[1] || ''} Of`,
      value: trimmed.replace(/^\(\d+ OF\)\s*/, ''),
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
  plans,
  showInfoTooltip,
  infoButtonRef,
  onInfoClick,
  onInfoMouseEnter,
  onInfoMouseLeave,
}: CourseDescriptionProps) {
  const [showAddToPlan, setShowAddToPlan] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedSemesterId, setSelectedSemesterId] = useState('');
  const [isPlanDropdownOpen, setIsPlanDropdownOpen] = useState(false);
  const [isSemesterDropdownOpen, setIsSemesterDropdownOpen] = useState(false);
  const [addStatus, setAddStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [addMessage, setAddMessage] = useState('');

  // Reset add-to-plan state when course changes
  useEffect(() => {
    setShowAddToPlan(false);
    setSelectedPlanId('');
    setSelectedSemesterId('');
    setAddStatus('idle');
    setAddMessage('');
  }, [courseInfo?.courseCode]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  const handleAddToPlan = async () => {
    if (!courseInfo || !selectedSemesterId) return;
    setAddStatus('loading');
    try {
      await addCourseToSemester(selectedSemesterId, courseInfo.courseCode, courseInfo.creditsMin ?? 3);
      setAddStatus('success');
      setAddMessage(`${courseInfo.courseCode} added to plan!`);
      window.dispatchEvent(new CustomEvent("tutorial:step-event", { detail: { name: "courseAddedToPlan" } }));
      setTimeout(() => {
        setShowAddToPlan(false);
        setAddStatus('idle');
        setAddMessage('');
      }, 2000);
    } catch {
      setAddStatus('error');
      setAddMessage('Failed to add course. Please try again.');
    }
  };

  useEffect(() => {
    const onClosePopups = () => {
      setShowAddToPlan(false);
      setIsPlanDropdownOpen(false);
      setIsSemesterDropdownOpen(false);
    };
    window.addEventListener("tutorial:close-popups", onClosePopups);
    return () => window.removeEventListener("tutorial:close-popups", onClosePopups);
  }, []);

  if (!courseInfo) {
    return (
      <div className="bg-panel-bg p-6 rounded-3xl border border-panel-border text-center py-12">
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
    <div className="bg-panel-bg rounded-3xl border border-panel-border flex flex-col h-[calc(100vh-200px)]">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-heading">{courseInfo.courseCode}</h2>
              {courseInfo.title && (
                <p className="mt-1 text-sm text-text-secondary">{courseInfo.title}</p>
              )}
              {courseInfo.credits && (
                <p className="mt-2 text-sm font-medium text-text-primary">
                  Credits: <span className="font-semibold">{courseInfo.credits}</span>
                </p>
              )}
            </div>
            {plans.length > 0 && (
              <button
                type="button"
                data-tutorial-target="courses-add-to-plan-toggle"
                onClick={() => {
                  setShowAddToPlan(!showAddToPlan);
                  setAddStatus('idle');
                  setAddMessage('');
                }}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-panel-bg border border-panel-border text-text-primary text-sm font-semibold hover:bg-hover-bg transition-colors cursor-pointer"
              >
                <Icon name="plus" color="currentColor" width={14} height={14} />
                Add to Plan
              </button>
            )}
          </div>

          {showAddToPlan && (
            <div className="mt-3 p-3 rounded-3xl border border-panel-border bg-hover-bg/30 space-y-3">
              <div className="flex flex-wrap gap-2">
                <DropdownMenu
                  isOpen={isPlanDropdownOpen}
                  onOpenChange={setIsPlanDropdownOpen}
                  trigger={
                    <button
                      type="button"
                      data-tutorial-target="courses-plan-select"
                      className="h-9 px-3 border border-panel-border rounded-full bg-input-bg text-text-primary text-sm text-left cursor-pointer flex items-center justify-between gap-2 focus:outline-none hover:border-panel-border-strong transition-all min-w-36"
                    >
                      <span className="truncate">{selectedPlan ? selectedPlan.title : 'Select plan'}</span>
                      <Icon name="chevron-down" color="currentColor" width={14} height={14} className="shrink-0 text-text-secondary" />
                    </button>
                  }
                >
                  <DropdownMenuContent maxHeight="max-h-48">
                    {plans.map((plan) => (
                      <DropdownMenuItem
                        key={plan.id}
                        selected={selectedPlanId === plan.id}
                        onClick={() => {
                          setSelectedPlanId(plan.id);
                          setSelectedSemesterId('');
                          setIsPlanDropdownOpen(false);
                          window.dispatchEvent(new CustomEvent("tutorial:step-event", { detail: { name: "coursePlanSelected" } }));
                        }}
                      >
                        {plan.title}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu
                  isOpen={isSemesterDropdownOpen}
                  onOpenChange={setIsSemesterDropdownOpen}
                  trigger={
                    <button
                      type="button"
                      data-tutorial-target="courses-semester-select"
                      disabled={!selectedPlan}
                      className="h-9 px-3 border border-panel-border rounded-full bg-input-bg text-text-primary text-sm text-left cursor-pointer flex items-center justify-between gap-2 focus:outline-none hover:border-panel-border-strong transition-all min-w-40 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="truncate">
                        {selectedSemesterId
                          ? selectedPlan?.semesters.find((s) => s.id === selectedSemesterId)
                              ? `${selectedPlan.semesters.find((s) => s.id === selectedSemesterId)!.termName} ${selectedPlan.semesters.find((s) => s.id === selectedSemesterId)!.year}`
                              : 'Select semester'
                          : 'Select semester'}
                      </span>
                      <Icon name="chevron-down" color="currentColor" width={14} height={14} className="shrink-0 text-text-secondary" />
                    </button>
                  }
                >
                  <DropdownMenuContent maxHeight="max-h-48">
                    {(selectedPlan?.semesters ?? []).map((semester) => (
                      <DropdownMenuItem
                        key={semester.id}
                        selected={selectedSemesterId === semester.id}
                        onClick={() => {
                          setSelectedSemesterId(semester.id);
                          setIsSemesterDropdownOpen(false);
                          window.dispatchEvent(new CustomEvent("tutorial:step-event", { detail: { name: "courseSemesterSelected" } }));
                        }}
                      >
                        {semester.termName} {semester.year}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <button
                  type="button"
                  data-tutorial-target="courses-add-to-plan-submit"
                  onClick={() => void handleAddToPlan()}
                  disabled={!selectedSemesterId || addStatus === 'loading' || addStatus === 'success'}
                  className="h-9 px-4 rounded-full bg-button-bg text-button-text text-sm font-semibold hover:bg-button-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addStatus === 'loading' ? 'Adding...' : addStatus === 'success' ? 'Added!' : 'Add'}
                </button>

                {addStatus !== 'success' && (
                  <button
                    type="button"
                    onClick={() => setShowAddToPlan(false)}
                    className="h-9 px-4 rounded-full border border-panel-border text-text-primary text-sm font-semibold hover:bg-hover-bg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {addStatus === 'error' && addMessage && (
                <p className="text-xs font-medium text-red-500">{addMessage}</p>
              )}
            </div>
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
    </div>
  );
}
