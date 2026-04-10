"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { RequirementMissing } from '../utils/prerequisiteChecker';
import { Icon } from '../components/Icon';
import { default as ConfirmModal } from '../components/ConfirmModal';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from '../components/DropdownMenu';
import {
  addSchoolYearToPlan,
  addSemesterToPlan,
  addCourseToSemester,
  removeDuplicateCoursesInSemester,
  updateCourseCreditValue,
  createNewPlan,
  deleteSchoolYearFromPlan,
  deleteSemesterFromPlan,
  deletePlan,
  generatePreliminaryPlan,
  getCourseCreditsInfoFromJSON,
  getCourseInfoFromJSON,
  getPlanBuilderData,
  importPlanFromStellicPdf,
  removeCourseFromSemester,
  renamePlan,
  checkPlanPrerequisites,
  checkCoursePrerequisites,
} from '../actions';

interface CourseInfo {
  courseCode: string;
  title: string | null;
  description: string | null;
  prerequisites: string[];
  corequisites: string[];
  otherRequirements: string[];
  terms: string[];
}

const PLAN_SELECTION_STORAGE_KEY = 'plan-builder:last-selected-plan';

type CourseOption = {
  code: string;
  title: string | null;
};

type PlanCourse = {
  id: string;
  courseCode: string;
  creditsMin: number | null;
  creditsMax: number | null;
};

type PlanSemester = {
  id: string;
  termName: string;
  termOrder: number;
  year: number;
  courses: PlanCourse[];
};

type PlanItem = {
  id: string;
  title: string;
  semesters: PlanSemester[];
};

type SchoolYearRow = {
  startYear: number;
  terms: Partial<Record<'Fall' | 'Winter' | 'Spring' | 'Summer', PlanSemester>>;
};

type HoverTooltipProps = {
  message: string;
  children: ReactNode;
};

function HoverTooltip({ message, children }: HoverTooltipProps) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, maxWidth: 0 });

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      if (!anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      const viewportPadding = 12;
      const maxWidth = Math.min(576, window.innerWidth - viewportPadding * 2);
      const idealLeft = rect.left + rect.width / 2;
      const clampedLeft = Math.min(
        Math.max(idealLeft, viewportPadding + 24),
        window.innerWidth - viewportPadding - 24
      );

      setPosition({
        left: clampedLeft,
        top: rect.top,
        maxWidth,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  return (
    <span
      ref={anchorRef}
      className="relative inline-flex"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {children}
      {isOpen && (
        <div
          className="fixed z-[80] px-3 py-2 bg-gray-900/90 text-white text-xs rounded-lg whitespace-pre-line text-left shadow-lg"
          style={{
            left: `${position.left}px`,
            top: `${position.top}px`,
            maxWidth: `${position.maxWidth}px`,
            transform: 'translate(-50%, calc(-100% - 8px))',
          }}
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
        >
          {message}
        </div>
      )}
    </span>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unable to read file as data URL.'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
}

function getStoredSelectedPlanId(userId: string): string {
  if (typeof window === 'undefined' || !userId) {
    return '';
  }

  return window.localStorage.getItem(`${PLAN_SELECTION_STORAGE_KEY}:${userId}`) ?? '';
}

function storeSelectedPlanId(userId: string, planId: string) {
  if (typeof window === 'undefined' || !userId) {
    return;
  }

  const storageKey = `${PLAN_SELECTION_STORAGE_KEY}:${userId}`;
  if (planId) {
    window.localStorage.setItem(storageKey, planId);
  } else {
    window.localStorage.removeItem(storageKey);
  }
}

function formatEnrollmentRequirement(requirement: string): { label: string; value: string } {
  const trimmed = requirement.trim();

  // Instructor permission is advisory and should render as a simple requirement label/value.
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

function splitRequirementGroups(requirements: RequirementMissing[]) {
  return {
    prerequisites: requirements.filter((requirement) => requirement.requisiteType === 'prerequisite'),
    corequisites: requirements.filter((requirement) => requirement.requisiteType === 'corequisite'),
    otherRequirements: requirements.filter((requirement) => requirement.requisiteType === 'other'),
  };
}

function buildRequirementTooltip(requirements: RequirementMissing[]): string {
  const groups = splitRequirementGroups(requirements);
  const sections: string[] = [];

  if (groups.prerequisites.length > 0) {
    sections.push(`Prerequisites\n${groups.prerequisites.map((requirement) => `- ${requirement.description.replace(/^Prerequisite:\s*/i, '')}`).join('\n')}`);
  }

  if (groups.corequisites.length > 0) {
    sections.push(`Corequisites\n${groups.corequisites.map((requirement) => `- ${requirement.description.replace(/^Corequisite:\s*/i, '')}`).join('\n')}`);
  }

  if (groups.otherRequirements.length > 0) {
    sections.push(`Other Requirements\n${groups.otherRequirements.map((requirement) => `- ${requirement.description.replace(/^Other Requirement:\s*/i, '')}`).join('\n')}`);
  }

  return sections.join('\n\n');
}

function RequirementGroupBlock({
  title,
  tone,
  requirements,
}: {
  title: string;
  tone: 'blue' | 'orange' | 'slate';
  requirements: RequirementMissing[];
}) {
  if (requirements.length === 0) {
    return null;
  }

  const toneClasses = {
    blue: 'bg-badge-blue-bg text-badge-blue-text',
    orange: 'bg-uva-orange/10 text-uva-orange',
    slate: 'bg-text-muted/10 text-text-secondary',
  } as const;

  return (
    <div>
      <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h5>
      <div className="space-y-2">
        {requirements.map((requirement, index) => {
          const detail = requirement.description
            .replace(/^Prerequisite:\s*/i, '')
            .replace(/^Corequisite:\s*/i, '')
            .replace(/^Other Requirement:\s*/i, '');

          return (
            <div key={`${title}-${index}`} className="rounded-3xl border border-panel-border bg-panel-bg-alt px-3 py-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${toneClasses[tone]}`}>
                {requirement.type === 'course' ? 'Course' : 'Requirement'}
              </span>
              <p className="mt-2 text-sm text-text-secondary leading-6">{detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function normalizeRequirementComparisonText(text: string): string {
  return text
    .replace(/^Prerequisite:\s*/i, '')
    .replace(/^Corequisite:\s*/i, '')
    .replace(/^Other Requirement:\s*/i, '')
    .replace(/^Missing:\s*/i, '')
    .replace(/^Choose one:\s*/i, '')
    .replace(/^Also required:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractRequirementCourseCodes(text: string): string[] {
  const matches = text.match(/[A-Z]{2,6}\s*\d{3,4}[A-Z]?/g) ?? [];
  return matches.map((match) => match.replace(/\s+/g, ' ').trim().toUpperCase());
}

function isDisplayedRequirementUnsatisfied(requirement: string, unmetRequirements: RequirementMissing[]): boolean {
  if (unmetRequirements.length === 0) {
    return false;
  }

  const requirementCourseCodes = new Set(extractRequirementCourseCodes(requirement));
  if (requirementCourseCodes.size > 0) {
    return unmetRequirements.some((unmetRequirement) =>
      unmetRequirement.missingCourses.some((courseCode) => requirementCourseCodes.has(courseCode.toUpperCase()))
    );
  }

  const normalizedRequirement = normalizeRequirementComparisonText(requirement);
  return unmetRequirements.some((unmetRequirement) => {
    const normalizedDescription = normalizeRequirementComparisonText(unmetRequirement.description);
    return normalizedDescription.includes(normalizedRequirement) || normalizedRequirement.includes(normalizedDescription);
  });
}

function AddCourseInline({
  semesterId,
  allCourses,
  onAddCourse,
  onCancel,
  onClearWarning,
}: {
  semesterId: string;
  allCourses: CourseOption[];
  onAddCourse: (semesterId: string, rawCourseCode: string, creditsText: string) => Promise<boolean>;
  onCancel: () => void;
  onClearWarning: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [courseCode, setCourseCode] = useState('');
  const [credits, setCredits] = useState('3');
  const [creditsMin, setCreditsMin] = useState<number | undefined>();
  const [creditsMax, setCreditsMax] = useState<number | undefined>();
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredCourses = useMemo(() => {
    if (!courseCode) return [];

    return allCourses
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
      });
  }, [courseCode, allCourses]);

  const submitCourse = async () => {
    const didAdd = await onAddCourse(semesterId, courseCode, credits);
    if (didAdd) {
      setCourseCode('');
      setCredits('3');
      setCreditsMin(undefined);
      setCreditsMax(undefined);
      setShowDropdown(false);
    }
  };

  return (
    <div className="flex space-x-2 mt-2 relative h-[46px] items-stretch">
      <div className="flex-1 relative h-full">
        <DropdownMenu
          isOpen={showDropdown && filteredCourses.length > 0}
          onOpenChange={setShowDropdown}
          className="w-full"
          trigger={
            <div className="h-[46px] w-full px-3 bg-panel-bg-alt border border-panel-border-strong rounded-full text-sm flex items-center justify-between gap-2">
              <div className="flex-1 h-full">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Course Code"
                  value={courseCode}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setCourseCode(newValue);
                    setShowDropdown(true);
                    // Only clear warning if user is actively typing (not on programmatic clear)
                    if (newValue.length > 0) {
                      onClearWarning();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void submitCourse();
                    }
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  className="w-full h-full bg-transparent text-text-primary focus:outline-none"
                  autoFocus
                />
              </div>
              {creditsMin && creditsMax && creditsMin !== creditsMax ? (
                <select
                  value={credits}
                  onChange={(e) => setCredits(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-panel-bg-alt text-text-primary border-none focus:outline-none font-semibold px-1 py-1 rounded text-sm z-10 relative cursor-pointer"
                >
                  {Array.from({ length: creditsMax - creditsMin + 1 }, (_, i) => creditsMin + i).map((val) => (
                    <option key={val} value={val.toString()}>
                      {val} cr
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-gray-500 font-semibold whitespace-nowrap">{credits} cr</span>
              )}
            </div>
          }
        >
          <DropdownMenuContent maxHeight="max-h-64">
            {filteredCourses.map((course) => (
              <DropdownMenuItem
                key={course.code}
                onClick={() => {
                  setCourseCode(course.code);
                  getCourseCreditsInfoFromJSON(course.code).then((res) => {
                    setCredits(res.credits.toString());
                    setCreditsMin(res.creditsMin);
                    setCreditsMax(res.creditsMax);
                  });
                  setShowDropdown(false);
                  requestAnimationFrame(() => {
                    inputRef.current?.focus();
                  });
                }}
                description={course.title || ''}
              >
                {course.code}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="ml-auto flex items-center justify-end space-x-1 px-1">
        <button onClick={() => void submitCourse()} className="text-success-text hover:text-success-text-hover p-2 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center transition-all hover:scale-110">
          <Icon name="check" color="currentColor" width={20} height={20} className="w-5 h-5" />
        </button>
        <button
          onClick={() => {
            onClearWarning();
            onCancel();
          }}
          className="text-danger-text hover:text-danger-text-hover p-2 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center transition-all hover:scale-110"
        >
          <Icon name="x" color="currentColor" width={20} height={20} className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

export default function PlanBuilderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMountedRef = useRef(true);
  const lastPlanPrereqCheckKeyRef = useRef('');
  const [userId, setUserId] = useState('');
  const [optimisticPlans, setOptimisticPlans] = useState<PlanItem[]>([]);
  const [allCourses, setAllCourses] = useState<CourseOption[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [isPlanDropdownOpen, setIsPlanDropdownOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [hoveredPlanId, setHoveredPlanId] = useState<string | null>(null);
  const [planTitle, setPlanTitle] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newCourseSem, setNewCourseSem] = useState<string | null>(null);
  const [selectedCourseInfo, setSelectedCourseInfo] = useState<CourseInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [selectedCourseMissingRequirements, setSelectedCourseMissingRequirements] = useState<RequirementMissing[]>([]);
  const [deletingPlan, setDeletingPlan] = useState(false);
  const [isDeletePlanConfirmOpen, setIsDeletePlanConfirmOpen] = useState(false);
  const [semesterToDelete, setSemesterToDelete] = useState<{ id: string; label: string } | null>(null);
  const [isDeleteSemesterConfirmOpen, setIsDeleteSemesterConfirmOpen] = useState(false);
  const [updatingSemester, setUpdatingSemester] = useState(false);
  const [isDeleteYearConfirmOpen, setIsDeleteYearConfirmOpen] = useState(false);
  const [yearToDelete, setYearToDelete] = useState<number | null>(null);
  const [updatingYear, setUpdatingYear] = useState(false);
  const [semesterActionError, setSemesterActionError] = useState<string | null>(null);
  const [collapsedSchoolYears, setCollapsedSchoolYears] = useState<Record<number, boolean>>({});
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isImportAuditOpen, setIsImportAuditOpen] = useState(false);
  const [isRenamePlanOpen, setIsRenamePlanOpen] = useState(false);
  const [importMode, setImportMode] = useState<'new' | 'overwrite'>('new');
  const [importNewPlanTitle, setImportNewPlanTitle] = useState('');
  const [importOverwritePlanId, setImportOverwritePlanId] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImportPlanDropdownOpen, setIsImportPlanDropdownOpen] = useState(false);
  const [importingPdf, setImportingPdf] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editingCourseCreditsRange, setEditingCourseCreditsRange] = useState<{ min: number; max: number } | null>(null);

  // Prerequisite tracking
  const [completedCourses, setCompletedCourses] = useState<string[]>([]);
  const [prereqWarning, setPrereqWarning] = useState<{ type: 'info' | 'warning' | 'error'; message: string; missingCourses?: string[]; detailedRequirements?: RequirementMissing[]; detailedPrerequisiteRequirements?: RequirementMissing[]; detailedCorequisiteRequirements?: RequirementMissing[]; detailedOtherRequirements?: RequirementMissing[] } | null>(null);
  const [showPrereqConfirm, setShowPrereqConfirm] = useState(false);
  const [pendingCourseAdd, setPendingCourseAdd] = useState<{ semesterId: string; courseCode: string; credits: number } | null>(null);
  // Map of semesterId -> Map of courseCode -> missing prerequisite codes
  const [semestersProblematicCourses, setSemestersProblematicCourses] = useState<Map<string, Map<string, RequirementMissing[]>>>(new Map());
  
  // Info tooltip for enrollment requirements
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isHoveringInfo, setIsHoveringInfo] = useState(false);
  const infoButtonRef = useRef<HTMLButtonElement | null>(null);
  
  // Comparison plan display
  const [comparisonPlan, setComparisonPlan] = useState<any | null>(null);

  const emitTutorialEvent = (name: string) => {
    if (typeof window === 'undefined') {
      return;
    }

    window.dispatchEvent(new CustomEvent('tutorial:step-event', { detail: { name } }));
  };

  // Load comparison plan from sessionStorage if in compare mode
  useEffect(() => {
    if (searchParams && searchParams.get('compare') === 'true' && typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('comparisonPlan');
      if (stored) {
        try {
          setComparisonPlan(JSON.parse(stored));
          // Clear it after reading so it doesn't persist
          sessionStorage.removeItem('comparisonPlan');
        } catch (error) {
          console.error('Error loading comparison plan:', error);
        }
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get('tutorialAction') !== 'openPlanImportModal') {
      return;
    }

    setIsImportAuditOpen(true);
  }, [searchParams]);

  useEffect(() => {
    if (!isImportAuditOpen) {
      return;
    }

    emitTutorialEvent('planImportModalOpened');
  }, [isImportAuditOpen]);

  useEffect(() => {
    if (!importFile) {
      return;
    }

    emitTutorialEvent('planImportFileSelected');
  }, [importFile]);

  useEffect(() => {
    const onClosePopups = () => {
      setIsImportAuditOpen(false);
      setIsImportPlanDropdownOpen(false);
    };
    window.addEventListener("tutorial:close-popups", onClosePopups);
    return () => window.removeEventListener("tutorial:close-popups", onClosePopups);
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

  // Detect if user is on desktop (lg breakpoint and above)
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

  const loadData = async (preferredPlanId?: string) => {
    const res = await getPlanBuilderData();

    if (!isMountedRef.current) {
      return;
    }

    if (res && 'error' in res && res.error === 'unauthenticated') {
      router.push('/login');
      return;
    }

    if (res && 'plans' in res) {
      const nextPlans = res.plans as PlanItem[];
      const nextUserId = res.userId ?? '';
      const storedSelection = getStoredSelectedPlanId(nextUserId);
      setUserId(res.userId ?? '');
      setOptimisticPlans(nextPlans);
      setAllCourses(res.allCourses ?? []);
      setCompletedCourses(res.completedCourses ?? []);

      const preferredSelection = preferredPlanId ? nextPlans.find((p) => p.id === preferredPlanId)?.id : undefined;
      const storedPlanSelection = storedSelection ? nextPlans.find((p) => p.id === storedSelection)?.id : undefined;
      const validSelection = nextPlans.find((p) => p.id === selectedPlanId)?.id;
      const fallbackSelection = nextPlans[0]?.id ?? '';
      const nextSelected = preferredSelection || storedPlanSelection || validSelection || fallbackSelection;
      setSelectedPlanId(nextSelected);
      storeSelectedPlanId(nextUserId, nextSelected);

      const nextPlan = nextPlans.find((p) => p.id === nextSelected);
      setPlanTitle(nextPlan?.title ?? '');
      setDataLoaded(true);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    void loadData();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const selectedPlan = optimisticPlans.find((p) => p.id === selectedPlanId);
    setPlanTitle(selectedPlan?.title ?? '');
  }, [selectedPlanId, optimisticPlans]);

  useEffect(() => {
    if (!dataLoaded) {
      return;
    }

    storeSelectedPlanId(userId, selectedPlanId);
  }, [dataLoaded, selectedPlanId, userId]);

  const activePlan = useMemo(
    () => optimisticPlans.find((p) => p.id === selectedPlanId) || optimisticPlans[0],
    [optimisticPlans, selectedPlanId]
  );

  // Check all existing courses in the plan for prerequisite violations
  useEffect(() => {
    const checkExistingCoursesPrerequisites = async () => {
      if (!activePlan || completedCourses.length === 0 && activePlan.semesters.length === 0) return;

      const checkKey = JSON.stringify({
        planId: activePlan.id,
        completedCourses: [...completedCourses].sort(),
        semesters: activePlan.semesters.map((semester) => ({
          id: semester.id,
          termOrder: semester.termOrder,
          courses: semester.courses.map((course) => course.courseCode).sort(),
        })),
      });

      if (lastPlanPrereqCheckKeyRef.current === checkKey) {
        return;
      }
      lastPlanPrereqCheckKeyRef.current = checkKey;

      const res = await checkPlanPrerequisites({
        completedCourses,
        planSemesters: activePlan.semesters,
      });

      const newProblematicCourses = new Map<string, Map<string, RequirementMissing[]>>();
      for (const [semesterId, courseMap] of Object.entries(res.problematicBySemester ?? {})) {
        const courseEntries = new Map<string, RequirementMissing[]>();
        for (const [courseCode, requirements] of Object.entries(courseMap ?? {})) {
          // Only add courses with actual requirement violations, not empty arrays
          if (requirements && Array.isArray(requirements) && requirements.length > 0) {
            courseEntries.set(courseCode, requirements as RequirementMissing[]);
          }
        }
        if (courseEntries.size > 0) {
          newProblematicCourses.set(semesterId, courseEntries);
        }
      }

      if (isMountedRef.current) {
        setSemestersProblematicCourses(newProblematicCourses);
      }
    };

    void checkExistingCoursesPrerequisites();
  }, [activePlan, completedCourses]);

  const courseCodeToTitle = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const course of allCourses) {
      map.set(course.code, course.title);
    }
    return map;
  }, [allCourses]);

  const schoolYearRows = useMemo<SchoolYearRow[]>(() => {
    if (!activePlan) return [];

    const rows = new Map<number, SchoolYearRow>();

    for (const sem of activePlan.semesters) {
      if (!['Fall', 'Winter', 'Spring', 'Summer'].includes(sem.termName)) {
        continue;
      }

      const startYear = sem.termName === 'Fall' ? sem.year : sem.year - 1;
      const existingRow = rows.get(startYear) ?? { startYear, terms: {} };
      existingRow.terms[sem.termName as 'Fall' | 'Winter' | 'Spring' | 'Summer'] = sem;
      rows.set(startYear, existingRow);
    }

    return Array.from(rows.values()).sort((a, b) => a.startYear - b.startYear);
  }, [activePlan]);

  const handleGenerate = async () => {
    if (!userId) return;
    setLoading(true);
    await generatePreliminaryPlan(userId, 'Computer Science (BA)', []);
    setLoading(false);
    void loadData();
  };

  const handleCreatePlan = async () => {
    setCreatingPlan(true);
    const res = await createNewPlan();
    setCreatingPlan(false);
    if (!res?.error && res?.planId) {
      void loadData(res.planId);
    }
  };

  const handleRenamePlan = async () => {
    if (!activePlan?.id) return;
    setSavingTitle(true);
    await renamePlan(activePlan.id, planTitle);
    setSavingTitle(false);
    void loadData();
  };

  const requestDeletePlan = () => {
    if (!activePlan?.id) return;
    setIsDeletePlanConfirmOpen(true);
  };

  const handleDeletePlan = async () => {
    if (!activePlan?.id) return;

    setIsDeletePlanConfirmOpen(false);
    setDeletingPlan(true);
    await deletePlan(activePlan.id);
    setDeletingPlan(false);
    void loadData();
  };

  const handleAddCourse = async (semesterId: string, rawCourseCode: string, creditsText: string): Promise<boolean> => {
    if (!rawCourseCode || !activePlan) return false;

    const code = rawCourseCode.toUpperCase().replace(/\s+/g, ' ').trim();
    const cr = Number.parseInt(creditsText, 10);
    if (Number.isNaN(cr)) {
      return false;
    }

    // Find the current semester to get termOrder
    const currentSem = activePlan.semesters.find((s) => s.id === semesterId);
    if (!currentSem) return false;

    const normalizeCode = (value: string) => value.toUpperCase().replace(/\s+/g, ' ').trim();
    const sameSemesterMatches = currentSem.courses.filter((courseInSemester) => normalizeCode(courseInSemester.courseCode) === code);
    if (sameSemesterMatches.length > 0) {
      // If duplicates are already present, collapse to one and clean up server-side.
      if (sameSemesterMatches.length > 1) {
        setOptimisticPlans((prev) =>
          prev.map((plan) => ({
            ...plan,
            semesters: plan.semesters.map((semester) => {
              if (semester.id !== semesterId) {
                return semester;
              }

              let keptOne = false;
              return {
                ...semester,
                courses: semester.courses.filter((courseInSemester) => {
                  if (normalizeCode(courseInSemester.courseCode) !== code) {
                    return true;
                  }
                  if (!keptOne) {
                    keptOne = true;
                    return true;
                  }
                  return false;
                }),
              };
            }),
          }))
        );
        void removeDuplicateCoursesInSemester(semesterId, code).then(() => {
          void loadData();
        });
      }

      setPrereqWarning({
        type: 'info',
        message: `${code} is already in this semester. Duplicate not added.`,
      });
      return false;
    }

    const existsInAnotherSemester = activePlan.semesters.some(
      (semester) =>
        semester.id !== semesterId &&
        semester.courses.some((courseInSemester) => normalizeCode(courseInSemester.courseCode) === code)
    );

    // Check prerequisites
    const result = await checkCoursePrerequisites({
      courseCode: code,
      completedCourses,
      planSemesters: activePlan.semesters,
      currentSemesterTermOrder: currentSem.termOrder,
      currentSemesterCourseCodes: currentSem.courses.map((courseInSemester) => courseInSemester.courseCode),
    });

    // Get the course's actual credit range from JSON
    const creditsInfo = await getCourseCreditsInfoFromJSON(code);
    const creditsMin = creditsInfo.creditsMin ?? cr;
    const creditsMax = creditsInfo.creditsMax ?? cr;

    // Handle the prerequisite result
    if (result.isSatisfied) {
      // Prerequisites are satisfied, proceed with adding course.
      if (existsInAnotherSemester) {
        setPrereqWarning({
          type: 'warning',
          message: `${code} is already planned in another semester.`,
        });
      } else {
        setPrereqWarning(null);
      }
      addCourseOptimistically(semesterId, code, creditsMin, creditsMax, !existsInAnotherSemester);
      return true;
    } else if (result.hasNoPrerequisites && result.hasNoCorequisites && result.hasNoOtherRequirements && result.hasUnknownPrerequisites) {
      // No prerequisites found but not 1000-level - show soft warning
      setPrereqWarning({
        type: 'info',
        message: `${code} might have enrollment requirements we don't have in our system (it's not a 1000-level course). It's been added anyway.`,
      });
      addCourseOptimistically(semesterId, code, creditsMin, creditsMax);
      return true;
    } else {
      setPrereqWarning({
        type: 'error',
        message: `${code} has unmet enrollment requirements. Prerequisites must be completed or planned in an earlier semester. Corequisites may be taken in the same semester.`,
        missingCourses: result.missingCourses,
        detailedRequirements: result.detailedRequirements,
        detailedPrerequisiteRequirements: result.detailedPrerequisiteRequirements,
        detailedCorequisiteRequirements: result.detailedCorequisiteRequirements,
        detailedOtherRequirements: result.detailedOtherRequirements,
      });
      setShowPrereqConfirm(true);
      setPendingCourseAdd({ semesterId, courseCode: code, credits: cr });
      return false;
    }
  };

  const addCourseOptimistically = (semesterId: string, code: string, creditsMin: number, creditsMax: number, clearWarning: boolean = true) => {
    setOptimisticPlans((prev) =>
      prev.map((p) => ({
        ...p,
        semesters: p.semesters.map((s) =>
          s.id === semesterId
            ? {
                ...s,
                courses: [...s.courses, { id: `temp-${Date.now()}`, courseCode: code, creditsMin, creditsMax }],
              }
            : s
        ),
      }))
    );

    setNewCourseSem(null);
    if (clearWarning) {
      setPrereqWarning(null);
    }

    void addCourseToSemesterAsync(semesterId, code, creditsMin, creditsMax);
  };

  const addCourseToSemesterAsync = async (semesterId: string, code: string, creditsMin: number, creditsMax: number) => {
    // Pass the selected credit value (use creditsMin as the "selected" value)
    await addCourseToSemester(semesterId, code, creditsMin);
    void loadData();
  };

  const handleProceedWithWarning = async () => {
    if (!pendingCourseAdd || !prereqWarning) return;
    
    // Add the course despite the warning
    setShowPrereqConfirm(false);
    
    // Track this course as problematic in the semester
    setSemestersProblematicCourses((prev) => {
      const updated = new Map(prev);
      const current = updated.get(pendingCourseAdd.semesterId) || new Map<string, RequirementMissing[]>();
      current.set(pendingCourseAdd.courseCode, prereqWarning.detailedRequirements || []);
      updated.set(pendingCourseAdd.semesterId, current);
      return updated;
    });

    // Get the course's actual credit range
    const creditsInfo = await getCourseCreditsInfoFromJSON(pendingCourseAdd.courseCode);
    const creditsMin = creditsInfo.creditsMin ?? pendingCourseAdd.credits;
    const creditsMax = creditsInfo.creditsMax ?? pendingCourseAdd.credits;
    
    addCourseOptimistically(pendingCourseAdd.semesterId, pendingCourseAdd.courseCode, creditsMin, creditsMax);
    setPendingCourseAdd(null);
  };

  const handleRemoveCourse = async (courseId: string) => {
    // Find which semester and course this is before updating state
    let semesterIdToUpdate: string | null = null;
    let removedCourseCode: string | null = null;

    // Search through current plan to find the course being removed
    if (activePlan) {
      for (const sem of activePlan.semesters) {
        const courseToRemove = sem.courses.find((c) => c.id === courseId);
        if (courseToRemove) {
          semesterIdToUpdate = sem.id;
          removedCourseCode = courseToRemove.courseCode;
          break;
        }
      }
    }

    setOptimisticPlans((prev) =>
      prev.map((p) => ({
        ...p,
        semesters: p.semesters.map((s) => ({
          ...s,
          courses: s.courses.filter((c) => c.id !== courseId),
        })),
      }))
    );

    // Update problematic courses tracking
    if (semesterIdToUpdate && removedCourseCode) {
      setSemestersProblematicCourses((prev) => {
        const updated = new Map(prev);
        const problematicInSem = updated.get(semesterIdToUpdate);
        if (problematicInSem) {
          problematicInSem.delete(removedCourseCode);
          if (problematicInSem.size === 0) {
            updated.delete(semesterIdToUpdate);
          }
        }
        return updated;
      });
    }

    await removeCourseFromSemester(courseId);
    void loadData();
  };

  const handleCourseClick = async (code: string, requirementsMissing: RequirementMissing[] = []) => {
    setLoadingInfo(true);
    setSelectedCourseMissingRequirements(requirementsMissing);
    const info = await getCourseInfoFromJSON(code);
    setSelectedCourseInfo(info);
    setLoadingInfo(false);
  };

  const handleAddSemester = async (schoolYearStart: number, termName: 'Fall' | 'Winter' | 'Spring' | 'Summer') => {
    if (!activePlan?.id) return;
    setSemesterActionError(null);

    const tempId = `temp-sem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempYear = termName === 'Fall' ? schoolYearStart : schoolYearStart + 1;
    const termOrderBase: Record<'Fall' | 'Winter' | 'Spring' | 'Summer', number> = {
      Fall: 1,
      Winter: 2,
      Spring: 3,
      Summer: 4,
    };
    const tempSemester: PlanSemester = {
      id: tempId,
      termName,
      termOrder: schoolYearStart * 10 + termOrderBase[termName],
      year: tempYear,
      courses: [],
    };

    setOptimisticPlans((prev) =>
      prev.map((plan) =>
        plan.id === activePlan.id
          ? { ...plan, semesters: [...plan.semesters, tempSemester] }
          : plan
      )
    );

    setUpdatingSemester(true);
    const res = await addSemesterToPlan(activePlan.id, schoolYearStart, termName);
    setUpdatingSemester(false);
    if (res?.error) {
      setOptimisticPlans((prev) =>
        prev.map((plan) =>
          plan.id === activePlan.id
            ? { ...plan, semesters: plan.semesters.filter((semester) => semester.id !== tempId) }
            : plan
        )
      );
      setSemesterActionError(res.error);
      return;
    }
    void loadData();
  };

  const requestDeleteSemester = (semesterId: string, label: string) => {
    setSemesterToDelete({ id: semesterId, label });
    setIsDeleteSemesterConfirmOpen(true);
  };

  const handleDeleteSemester = async () => {
    if (!semesterToDelete || !activePlan?.id) return;

    const semesterToRestore = activePlan.semesters.find((semester) => semester.id === semesterToDelete.id);
    setIsDeleteSemesterConfirmOpen(false);
    setSemesterActionError(null);

    setOptimisticPlans((prev) =>
      prev.map((plan) =>
        plan.id === activePlan.id
          ? { ...plan, semesters: plan.semesters.filter((semester) => semester.id !== semesterToDelete.id) }
          : plan
      )
    );

    setUpdatingSemester(true);
    const res = await deleteSemesterFromPlan(semesterToDelete.id);
    setUpdatingSemester(false);
    if (res?.error) {
      if (semesterToRestore) {
        setOptimisticPlans((prev) =>
          prev.map((plan) =>
            plan.id === activePlan.id
              ? { ...plan, semesters: [...plan.semesters, semesterToRestore] }
              : plan
          )
        );
      }
      setSemesterActionError(res.error);
      return;
    }
    setSemesterToDelete(null);
    void loadData();
  };

  const handleAddYear = async () => {
    if (!activePlan?.id) return;
    setSemesterActionError(null);

    const schoolYearStarts = new Set<number>();
    for (const sem of activePlan.semesters) {
      if (!['Fall', 'Winter', 'Spring', 'Summer'].includes(sem.termName)) continue;
      schoolYearStarts.add(sem.termName === 'Fall' ? sem.year : sem.year - 1);
    }

    const nextSchoolYearStart =
      schoolYearStarts.size > 0 ? Math.max(...Array.from(schoolYearStarts)) + 1 : 2025;
    const latestTermOrder = activePlan.semesters.reduce((max, sem) => Math.max(max, sem.termOrder), 0);

    const tempFallId = `temp-sem-${Date.now()}-fall`;
    const tempSpringId = `temp-sem-${Date.now()}-spring`;
    const optimisticYearSemesters: PlanSemester[] = [
      {
        id: tempFallId,
        termName: 'Fall',
        termOrder: latestTermOrder + 1,
        year: nextSchoolYearStart,
        courses: [],
      },
      {
        id: tempSpringId,
        termName: 'Spring',
        termOrder: latestTermOrder + 2,
        year: nextSchoolYearStart + 1,
        courses: [],
      },
    ];

    setOptimisticPlans((prev) =>
      prev.map((plan) =>
        plan.id === activePlan.id
          ? { ...plan, semesters: [...plan.semesters, ...optimisticYearSemesters] }
          : plan
      )
    );

    setUpdatingYear(true);
    const res = await addSchoolYearToPlan(activePlan.id);
    setUpdatingYear(false);
    if (res?.error) {
      setOptimisticPlans((prev) =>
        prev.map((plan) =>
          plan.id === activePlan.id
            ? {
                ...plan,
                semesters: plan.semesters.filter(
                  (sem) => sem.id !== tempFallId && sem.id !== tempSpringId
                ),
              }
            : plan
        )
      );
      setSemesterActionError(res.error);
      return;
    }
    void loadData();
  };

  const requestDeleteYear = (schoolYearStart: number) => {
    setYearToDelete(schoolYearStart);
    setIsDeleteYearConfirmOpen(true);
  };

  const handleDeleteYear = async () => {
    if (!activePlan?.id || yearToDelete === null) return;

    const semestersToRestore = activePlan.semesters.filter((sem) => {
      if (sem.termName === 'Fall') return sem.year === yearToDelete;
      if (sem.termName === 'Winter' || sem.termName === 'Spring' || sem.termName === 'Summer') {
        return sem.year === yearToDelete + 1;
      }
      return false;
    });

    setIsDeleteYearConfirmOpen(false);
    setSemesterActionError(null);

    setOptimisticPlans((prev) =>
      prev.map((plan) =>
        plan.id === activePlan.id
          ? {
              ...plan,
              semesters: plan.semesters.filter((sem) => !semestersToRestore.some((target) => target.id === sem.id)),
            }
          : plan
      )
    );

    setUpdatingYear(true);
    const res = await deleteSchoolYearFromPlan(activePlan.id, yearToDelete);
    setUpdatingYear(false);
    if (res?.error) {
      setOptimisticPlans((prev) =>
        prev.map((plan) =>
          plan.id === activePlan.id
            ? { ...plan, semesters: [...plan.semesters, ...semestersToRestore] }
            : plan
        )
      );
      setSemesterActionError(res.error);
      return;
    }
    setYearToDelete(null);
    void loadData();
  };

  const handleImportFromPdf = async () => {
    if (!importFile) {
      setImportError('Please choose a Stellic plan report PDF file.');
      return;
    }
    if (importMode === 'overwrite' && !importOverwritePlanId) {
      setImportError('Please choose a plan to overwrite.');
      return;
    }

    setImportError(null);
    setImportingPdf(true);
    try {
      const dataUrl = await fileToDataUrl(importFile);
      const res = await importPlanFromStellicPdf({
        pdfBase64: dataUrl,
        mode: importMode,
        overwritePlanId: importMode === 'overwrite' ? importOverwritePlanId : undefined,
        newPlanTitle: importMode === 'new' ? importNewPlanTitle || undefined : undefined,
      });

      if (res?.error) {
        setImportError(res.error);
        setImportingPdf(false);
        return;
      }

      setImportFile(null);
      setImportNewPlanTitle('');
      setImportOverwritePlanId('');
      setImportMode('new');
      setIsImportPlanDropdownOpen(false);
      setIsImportAuditOpen(false);
      emitTutorialEvent('planImportCompleted');
      setImportingPdf(false);
      void loadData(res?.planId);
    } catch {
      setImportError('Unable to read PDF file.');
      setImportingPdf(false);
    }
  };

  const toggleSchoolYearCollapse = (startYear: number) => {
    setCollapsedSchoolYears((prev) => ({
      ...prev,
      [startYear]: !prev[startYear],
    }));
  };

  const selectedPlanLabel = optimisticPlans.find((p) => p.id === selectedPlanId)?.title || 'Select plan';
  const importPlanLabel = importOverwritePlanId
    ? optimisticPlans.find((p) => p.id === importOverwritePlanId)?.title || 'Select plan to overwrite'
    : 'Select plan to overwrite';

  if (!dataLoaded) {
    return (
      <div className="w-full pt-0 pb-6 animate-pulse">
        {/* Header */}
        <div className="mb-6 border-b border-panel-border pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="h-[42px] w-48 rounded bg-input-disabled" />
            <div className="flex items-center gap-2 w-full sm:w-auto sm:min-w-[320px]">
              <div className="h-[38px] flex-1 rounded bg-input-disabled" />
              <div className="h-10 w-10 rounded-full bg-input-disabled shrink-0" />
            </div>
          </div>
        </div>

        {/* School year sections */}
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, yi) => (
            <section key={yi} className="space-y-3">
              {/* Year header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-input-disabled shrink-0" />
                  <div className="space-y-1">
                    <div className="h-3 w-20 rounded bg-input-disabled" />
                    <div className="h-6 w-28 rounded bg-input-disabled" />
                  </div>
                </div>
                <div className="h-7 w-24 rounded bg-input-disabled" />
              </div>

              {/* Semester cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 2 }).map((_, si) => (
                  <div key={si} className="bg-panel-bg border border-panel-border rounded-3xl p-5 min-h-[180px]">
                    {/* Card header */}
                    <div className="flex justify-between items-center border-b border-panel-border pb-2 mb-3">
                      <div className="h-6 w-28 rounded bg-input-disabled" />
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-10 rounded bg-input-disabled" />
                        <div className="h-7 w-7 rounded-full bg-input-disabled" />
                      </div>
                    </div>
                    {/* Course rows */}
                    <div className="space-y-2">
                      <div className="h-[46px] w-full rounded-xl bg-input-disabled" />
                      <div className="h-[46px] w-full rounded-xl bg-input-disabled" />
                      <div className="h-[46px] w-3/4 rounded-xl bg-input-disabled" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full pt-0 pb-6">
      <div className="mb-6 border-b border-panel-border pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-3xl font-bold text-heading">Plan Builder</h1>
          <div className="flex w-full sm:w-auto sm:min-w-[320px] items-center gap-2">
            <DropdownMenu
              isOpen={isPlanDropdownOpen}
              onOpenChange={(open) => {
                setIsPlanDropdownOpen(open);
                if (!open) setHoveredPlanId(null);
              }}
              disabled={optimisticPlans.length === 0}
              className="flex-1"
              trigger={
                <button
                  type="button"
                  disabled={optimisticPlans.length === 0}
                  className="w-full px-4 py-2.5 border border-panel-border rounded-full bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none hover:border-panel-border-strong"
                >
                  <span className="truncate text-sm font-medium">{selectedPlanLabel}</span>
                  <Icon name="chevron-down" color="currentColor" width={16} height={16} className={`w-4 h-4 ml-2 shrink-0 text-text-secondary transition-transform duration-200 ${isPlanDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
              }
            >
              <DropdownMenuContent>
                {optimisticPlans.map((p) => {
                  const isSelected = selectedPlanId === p.id;
                  return (
                    <DropdownMenuItem
                      key={p.id}
                      selected={isSelected}
                      onClick={() => {
                        setSelectedPlanId(p.id);
                        setHoveredPlanId(null);
                        setIsPlanDropdownOpen(false);
                      }}
                    >
                      {p.title}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsMoreMenuOpen((prev) => !prev)}
                data-tutorial-target="open-plan-more-actions"
                onBlur={() =>
                  setTimeout(() => {
                    setIsMoreMenuOpen(false);
                  }, 150)
                }
                className="inline-flex items-center justify-center w-10 h-10 rounded-full text-text-primary hover:bg-hover-bg transition-colors cursor-pointer"
                aria-label="More plan actions"
              >
                <Icon name="dots-vertical" color="currentColor" width={18} height={18} className="w-4.5 h-4.5" />
              </button>

              {isMoreMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-52 rounded-3xl border border-panel-border bg-panel-bg shadow-lg z-20 p-1.5 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      void handleCreatePlan();
                      setIsMoreMenuOpen(false);
                    }}
                    disabled={creatingPlan}
                    className="w-full px-3 py-2 rounded-xl text-left text-sm text-text-primary hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2.5"
                  >
                    <Icon name="plus" color="currentColor" width={15} height={15} className="shrink-0 text-text-secondary" />
                    {creatingPlan ? 'Creating...' : 'New Plan'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleAddYear();
                      setIsMoreMenuOpen(false);
                    }}
                    disabled={!activePlan || updatingYear}
                    className="w-full px-3 py-2 rounded-xl text-left text-sm text-text-primary hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2.5"
                  >
                    <Icon name="calendar" color="currentColor" width={15} height={15} className="shrink-0 text-text-secondary" />
                    {updatingYear ? 'Adding Year...' : 'Add Year'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsRenamePlanOpen(true);
                      setIsMoreMenuOpen(false);
                    }}
                    disabled={!activePlan}
                    className="w-full px-3 py-2 rounded-xl text-left text-sm text-text-primary hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2.5"
                  >
                    <Icon name="edit" color="currentColor" width={15} height={15} className="shrink-0 text-text-secondary" />
                    Rename Plan
                  </button>
                  <button
                    type="button"
                    data-tutorial-target="open-plan-import"
                    onClick={() => {
                      setIsImportAuditOpen(true);
                      setIsMoreMenuOpen(false);
                      setImportMode('new');
                      setImportOverwritePlanId('');
                      setIsImportPlanDropdownOpen(false);
                      setImportError(null);
                    }}
                    className="w-full px-3 py-2 rounded-lg text-left text-sm text-text-primary hover:bg-hover-bg transition-colors cursor-pointer flex items-center gap-2.5"
                  >
                    <Icon name="external-link" color="currentColor" width={15} height={15} className="shrink-0 text-text-secondary" />
                    Import Plan
                  </button>
                  <div className="my-1 border-t border-panel-border" />
                  <button
                    type="button"
                    onClick={() => {
                      requestDeletePlan();
                      setIsMoreMenuOpen(false);
                    }}
                    disabled={!activePlan || deletingPlan}
                    className="w-full px-3 py-2 rounded-xl text-left text-sm text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2.5"
                  >
                    <Icon name="trash" color="currentColor" width={15} height={15} className="shrink-0" />
                    {deletingPlan ? 'Deleting...' : 'Delete Plan'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={`w-full grid gap-6 ${comparisonPlan ? 'grid-cols-1 lg:grid-cols-2' : ''}`}>
        {/* User's Plan */}
        <div className="min-w-0">
          {semesterActionError && (
            <div className="mb-4 bg-red-500/10 border border-red-500/40 text-red-500 px-4 py-2 rounded-xl text-sm font-semibold">
              {semesterActionError}
            </div>
          )}

          {!activePlan ? (
            <div className="p-8 text-center text-gray-500">No plan found. Click New Plan to get started.</div>
          ) : (
            <div className="space-y-6">
              {schoolYearRows.map((row) => {
              const orderedTerms = (['Fall', 'Winter', 'Spring', 'Summer'] as const).filter((term) => Boolean(row.terms[term]));
              const missingTerms = (['Fall', 'Winter', 'Spring', 'Summer'] as const).filter((term) => !row.terms[term]);
              // Reduce column count when in comparison mode since the container is narrower
              const baseColumnCount = Math.max(2, Math.min(4, orderedTerms.length));
              const columnCount = comparisonPlan ? 2 : baseColumnCount;
              const gridColsClass =
                columnCount <= 2 ? 'grid-cols-1 md:grid-cols-2' :
                columnCount === 3 ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3' :
                'grid-cols-1 md:grid-cols-2 xl:grid-cols-4';
              const isCollapsed = Boolean(collapsedSchoolYears[row.startYear]);
              const totalCourses = orderedTerms.reduce((count, term) => count + (row.terms[term]?.courses.length ?? 0), 0);
              const totalCredits = orderedTerms.reduce(
                (count, term) => count + (row.terms[term]?.courses.reduce((sum, course) => sum + (course.creditsMin ?? 0), 0) ?? 0),
                0
              );

              return (
                <section key={row.startYear} className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleSchoolYearCollapse(row.startYear)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-panel-border-strong text-text-secondary hover:bg-hover-bg transition-colors cursor-pointer"
                        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} school year ${row.startYear}-${row.startYear + 1}`}
                      >
                        <Icon name="chevron-down" color="currentColor" width={16} height={16} className={`w-4 h-4 transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
                      </button>
                      <div className="leading-tight">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-text-tertiary">School Year</p>
                        <h2 className="text-xl font-semibold text-heading tracking-tight">{row.startYear}-{row.startYear + 1}</h2>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => requestDeleteYear(row.startYear)}
                        disabled={updatingYear || schoolYearRows.length <= 1}
                        className="px-3 py-1.5 text-xs font-semibold border border-red-400 text-red-500 rounded-full hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Remove Year
                      </button>
                      {!isCollapsed && missingTerms.map((term) => (
                        <button
                          key={`${row.startYear}-${term}`}
                          type="button"
                          onClick={() => void handleAddSemester(row.startYear, term)}
                          disabled={updatingSemester}
                          className="px-3 py-1.5 text-xs font-semibold border border-panel-border-strong rounded-full text-text-primary hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Add {term}
                        </button>
                      ))}
                    </div>
                  </div>

                  {isCollapsed ? (
                    <div className="px-4 py-3 rounded-xl border border-panel-border bg-panel-bg-alt text-sm text-text-secondary">
                      {orderedTerms.length} semesters, {totalCourses} courses, {totalCredits} credits
                    </div>
                  ) : (
                  <div className={`grid gap-4 ${gridColsClass}`}>
                    {orderedTerms.map((term) => {
                      const sem = row.terms[term];
                      if (!sem) return null;

                      return (
                        <div key={sem.id} className="bg-panel-bg border border-panel-border rounded-3xl p-5 min-w-0">
                          <div className="flex justify-between items-center border-b border-panel-border pb-2 mb-3 gap-2">
                            <h3 className="font-bold text-lg text-heading flex items-center gap-1 flex-shrink-0">
                              {sem.termName} {sem.year}
                              {semestersProblematicCourses.has(sem.id) && (
                                <HoverTooltip message={`Courses with unsatisfied requirements\n${Array.from(semestersProblematicCourses.get(sem.id)?.keys() || []).map((courseCode) => `- ${courseCode}`).join('\n')}`}>
                                  <Icon name="alert-triangle" color="currentColor" width={20} height={20} className="w-5 h-5 text-yellow-500 cursor-help hover:text-yellow-600 transition-colors" aria-label="Contains course(s) with unsatisfied prerequisites" />
                                </HoverTooltip>
                              )}
                            </h3>
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-semibold bg-input-disabled px-2 py-1 rounded-full text-text-secondary whitespace-nowrap">
                                {sem.courses.reduce((acc, c) => acc + (c.creditsMin ?? 0), 0)} cr
                              </span>
                              <button
                                type="button"
                                onClick={() => requestDeleteSemester(sem.id, `${sem.termName} ${sem.year}`)}
                                disabled={updatingSemester}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-full text-text-tertiary hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                aria-label={`Delete ${sem.termName} ${sem.year}`}
                              >
                                <Icon name="trash" color="currentColor" width={14} height={14} className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {sem.courses.map((course) => {
                              const requirementsMissing = semestersProblematicCourses.get(sem.id)?.get(course.courseCode) ?? [];
                              const isProblematic = requirementsMissing.length > 0;
                              const tooltipMessage = requirementsMissing.length > 0
                                ? buildRequirementTooltip(requirementsMissing)
                                : 'Requirements not satisfied';
                              const courseTitle = courseCodeToTitle.get(course.courseCode);
                              return (
                                <div key={course.id} onClick={() => handleCourseClick(course.courseCode, requirementsMissing)} className="px-3 py-2 bg-panel-bg-alt border border-panel-border-strong rounded-xl text-sm flex justify-between items-stretch hover:border-uva-blue transition-colors cursor-pointer group min-w-0">
                                  <div className="flex flex-col justify-center flex-1 min-w-0">
                                    <span className="font-medium text-text-primary flex items-center gap-2 max-w-[100px] truncate">
                                      {course.courseCode}
                                      {isProblematic && (
                                        <HoverTooltip message={tooltipMessage}>
                                          <Icon name="alert-triangle" color="currentColor" width={16} height={16} className="w-4 h-4 text-yellow-500 flex-shrink-0 cursor-help hover:text-yellow-600 transition-colors" />
                                        </HoverTooltip>
                                      )}
                                    </span>
                                    {courseTitle && (
                                      <p className="text-xs text-text-muted truncate mt-0.5 min-w-0">{courseTitle}</p>
                                    )}
                                  </div>
                                  <div className="relative flex items-center justify-end min-w-fit gap-2 pl-2">
                                    {editingCourseId === course.id && editingCourseCreditsRange ? (
                                      <select
                                        value={course.creditsMin ?? 3}
                                        onChange={(e) => {
                                          const newCredits = Number.parseInt(e.target.value, 10);
                                          void updateCourseCreditValue(course.id, newCredits).then(() => {
                                            setEditingCourseId(null);
                                            setEditingCourseCreditsRange(null);
                                            void loadData();
                                          });
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-panel-bg-alt text-text-primary border-none focus:outline-none font-semibold px-1 py-1 rounded text-sm transition-transform duration-200 group-hover:-translate-x-6"
                                        autoFocus
                                      >
                                        {Array.from({ length: editingCourseCreditsRange.max - editingCourseCreditsRange.min + 1 }, (_, i) => editingCourseCreditsRange.min + i).map((val) => (
                                          <option key={val} value={val}>
                                            {val} cr
                                          </option>
                                        ))}
                                      </select>
                                    ) : ((course.creditsMin ?? 3) !== (course.creditsMax ?? 3)) ? (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const creditsMin = course.creditsMin ?? 3;
                                          const creditsMax = course.creditsMax ?? 3;
                                          setEditingCourseId(course.id);
                                          setEditingCourseCreditsRange({ min: creditsMin, max: creditsMax });
                                        }}
                                        className="text-gray-500 font-semibold whitespace-nowrap cursor-pointer hover:text-uva-orange transition-transform duration-200 group-hover:-translate-x-6"
                                      >
                                        {course.creditsMin ?? 0}-{course.creditsMax ?? 0} cr
                                      </button>
                                    ) : (
                                      <span className="text-gray-500 font-semibold whitespace-nowrap transition-transform duration-200 group-hover:-translate-x-6">
                                        {course.creditsMin ?? 0} cr
                                      </span>
                                    )}
                                    <button onClick={(e) => { e.stopPropagation(); void handleRemoveCourse(course.id); }} className="absolute right-0 text-danger-text hover:text-danger-text-hover opacity-0 translate-x-1 group-hover:opacity-100 p-2 cursor-pointer flex items-center justify-center transition-all duration-200 hover:scale-110">
                                      <Icon name="x" color="currentColor" width={16} height={16} className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}

                            {newCourseSem === sem.id ? (
                              <>
                              <AddCourseInline
                                semesterId={sem.id}
                                allCourses={allCourses}
                                onAddCourse={handleAddCourse}
                                onCancel={() => setNewCourseSem(null)}
                                onClearWarning={() => setPrereqWarning(null)}
                              />

                              {prereqWarning && (
                                <div className={`mt-2 p-3 rounded-lg text-sm ${
                                  prereqWarning.type === 'error'
                                    ? 'bg-red-500/10 border border-red-500/30 text-red-600'
                                    : prereqWarning.type === 'warning'
                                      ? 'bg-amber-500/10 border border-amber-500/30 text-amber-700'
                                      : 'bg-blue-500/10 border border-blue-500/30 text-blue-600'
                                }`}>
                                  {prereqWarning.type === 'error' && (
                                    <div className="flex items-start gap-2">
                                      <Icon name="alert-triangle" color="currentColor" width={16} height={16} className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                      <div>
                                        <p className="font-semibold">{prereqWarning.message}</p>
                                        {prereqWarning.detailedRequirements && prereqWarning.detailedRequirements.length > 0 && (
                                          <div className="mt-3 space-y-3">
                                            <RequirementGroupBlock
                                              title="Prerequisites"
                                              tone="blue"
                                              requirements={prereqWarning.detailedPrerequisiteRequirements || []}
                                            />
                                            <RequirementGroupBlock
                                              title="Corequisites"
                                              tone="orange"
                                              requirements={prereqWarning.detailedCorequisiteRequirements || []}
                                            />
                                            <RequirementGroupBlock
                                              title="Other Requirements"
                                              tone="slate"
                                              requirements={prereqWarning.detailedOtherRequirements || []}
                                            />
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  {prereqWarning.type === 'info' && (
                                    <div className="flex items-start gap-2">
                                      <Icon name="help-circle" color="currentColor" width={16} height={16} className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                      <p>{prereqWarning.message}</p>
                                    </div>
                                  )}
                                  {prereqWarning.type === 'warning' && (
                                    <div className="flex items-start gap-2">
                                      <Icon name="alert-triangle" color="currentColor" width={16} height={16} className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                      <p>{prereqWarning.message}</p>
                                    </div>
                                  )}
                                </div>
                              )}
                              </>
                            ) : (
                              <button onClick={() => { setNewCourseSem(sem.id); setPrereqWarning(null); }} className="mt-2 text-sm font-semibold text-gray-500 hover:text-uva-orange hover:border-uva-orange hover:bg-hover-bg hover:text-uva-orange hover:border-uva-orange w-full text-center px-3 border border-dashed border-panel-border-strong rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed h-[46px] flex items-center justify-center">
                                <Icon name="plus" color="currentColor" width={16} height={16} className="w-4 h-4 mr-1" /> Add Course
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  )}
                </section>
              );
            })}
            </div>
          )}
        </div>
      </div>

      {isImportAuditOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setIsImportAuditOpen(false)}>
          <div className="bg-panel-bg-alt border border-panel-border rounded-3xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-xl text-heading">Import Plan</h2>
              <button onClick={() => setIsImportAuditOpen(false)} className="text-text-muted hover:text-text-secondary cursor-pointer" aria-label="Close import plan">
                <Icon name="x" color="currentColor" width={20} height={20} />
              </button>
            </div>

            <div className="space-y-3" data-tutorial-target="plan-import-container">
              <p className="text-sm text-text-secondary">
                Open Stellic → Plan your Path → Download Plan → Create plan report
              </p>

              <div className="flex gap-2" data-tutorial-target="plan-import-mode">
                <button
                  type="button"
                  onClick={() => {
                    setImportMode('new');
                    emitTutorialEvent('planImportModeSelected');
                    setIsImportPlanDropdownOpen(false);
                    setImportError(null);
                  }}
                  className={`px-3 py-2 text-sm font-semibold rounded-full border transition-colors cursor-pointer ${importMode === 'new' ? 'bg-uva-blue/90 text-white border-uva-blue' : 'border-panel-border-strong text-text-primary hover:bg-hover-bg'}`}
                >
                  New Plan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportMode('overwrite');
                    emitTutorialEvent('planImportModeSelected');
                    setImportOverwritePlanId((prev) => prev || activePlan?.id || '');
                    setImportError(null);
                  }}
                  className={`px-3 py-2 text-sm font-semibold rounded-full border transition-colors cursor-pointer ${importMode === 'overwrite' ? 'bg-uva-blue/90 text-white border-uva-blue' : 'border-panel-border-strong text-text-primary hover:bg-hover-bg'}`}
                >
                  Overwrite
                </button>
              </div>

              {importMode === 'new' && (
                <input
                  type="text"
                  value={importNewPlanTitle}
                  onChange={(e) => setImportNewPlanTitle(e.target.value)}
                  placeholder="Optional new plan name"
                  className="w-full px-3 py-2 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none"
                />
              )}

              {importMode === 'overwrite' && (
                <DropdownMenu
                  isOpen={isImportPlanDropdownOpen}
                  onOpenChange={setIsImportPlanDropdownOpen}
                  trigger={
                    <button
                      type="button"
                      className="w-full px-4 py-2.5 border border-panel-border rounded-full bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between hover:border-panel-border-strong transition-colors"
                    >
                      <span className="truncate text-sm font-medium">{importPlanLabel}</span>
                      <Icon name="chevron-down" color="currentColor" width={16} height={16} className={`w-4 h-4 text-text-secondary transition-transform duration-200 ${isImportPlanDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                  }
                >
                  <DropdownMenuContent maxHeight="max-h-40">
                    {optimisticPlans.map((plan) => (
                      <DropdownMenuItem
                        key={plan.id}
                        selected={importOverwritePlanId === plan.id}
                        onClick={() => {
                          setImportOverwritePlanId(plan.id);
                          setIsImportPlanDropdownOpen(false);
                        }}
                      >
                        {plan.title}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <input
                type="file"
                accept="application/pdf"
                data-tutorial-target="plan-import-file"
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] ?? null);
                  if (e.target.files?.[0]) emitTutorialEvent('planImportFileSelected');
                }}
                className="w-full text-sm text-text-primary file:mr-3 file:px-3 file:py-2 file:border file:border-panel-border-strong file:rounded file:bg-panel-bg-alt file:text-text-primary file:cursor-pointer"
              />

              {importError && (
                <div className="bg-red-500/10 border border-red-500/40 text-red-500 px-3 py-2 rounded text-sm font-semibold">
                  {importError}
                </div>
              )}

              <button
                type="button"
                data-tutorial-target="plan-import-submit"
                onClick={() => void handleImportFromPdf()}
                disabled={importingPdf}
                className="w-full px-4 py-2 bg-uva-blue/90 text-white rounded-full hover:bg-uva-blue font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importingPdf ? 'Importing...' : 'Import Plan PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isRenamePlanOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setIsRenamePlanOpen(false)}>
          <div className="bg-panel-bg-alt border border-panel-border rounded-3xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-xl text-heading">Rename Plan</h2>
              <button onClick={() => setIsRenamePlanOpen(false)} className="text-text-muted hover:text-text-secondary cursor-pointer" aria-label="Close rename plan">
                <Icon name="x" color="currentColor" width={20} height={20} />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary">Plan Name</label>
              <input
                type="text"
                value={planTitle}
                onChange={(e) => setPlanTitle(e.target.value)}
                className="w-full px-3 py-2 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none"
                disabled={!activePlan || savingTitle}
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsRenamePlanOpen(false)}
                  className="px-4 py-2 border border-panel-border-strong rounded-full font-semibold text-text-primary hover:bg-hover-bg transition-colors cursor-pointer"
                  disabled={savingTitle}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      await handleRenamePlan();
                      setIsRenamePlanOpen(false);
                    })();
                  }}
                  disabled={!activePlan || savingTitle}
                  className="px-4 py-2 bg-uva-blue/90 text-white rounded-full font-semibold hover:bg-uva-blue transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingTitle ? 'Saving...' : 'Save Name'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={isDeletePlanConfirmOpen}
        title="Delete Plan"
        message={`Delete "${activePlan?.title ?? 'this plan'}"? This cannot be undone.`}
        confirmLabel="Delete"
        isConfirming={deletingPlan}
        onCancel={() => setIsDeletePlanConfirmOpen(false)}
        onConfirm={() => void handleDeletePlan()}
      />

      <ConfirmModal
        isOpen={isDeleteSemesterConfirmOpen}
        title="Delete Semester"
        message={`Delete ${semesterToDelete?.label ?? 'this semester'} and all its courses? This cannot be undone.`}
        confirmLabel="Delete"
        isConfirming={updatingSemester}
        onCancel={() => {
          setIsDeleteSemesterConfirmOpen(false);
          setSemesterToDelete(null);
        }}
        onConfirm={() => void handleDeleteSemester()}
      />

      <ConfirmModal
        isOpen={isDeleteYearConfirmOpen}
        title="Delete School Year"
        message={`Delete ${yearToDelete !== null ? `${yearToDelete}-${yearToDelete + 1}` : 'this school year'} and all included semesters/courses? This cannot be undone.`}
        confirmLabel="Delete"
        isConfirming={updatingYear}
        onCancel={() => {
          setIsDeleteYearConfirmOpen(false);
          setYearToDelete(null);
        }}
        onConfirm={() => void handleDeleteYear()}
      />

      <ConfirmModal
        isOpen={showPrereqConfirm}
        title="Missing Requirements"
        message={prereqWarning?.message || `${pendingCourseAdd?.courseCode} has unmet enrollment requirements. Are you sure you want to add this course anyway? A warning indicator will appear on this semester.`}
        confirmLabel="Add Anyway"
        cancelLabel="Cancel"
        isConfirming={false}
        onCancel={() => {
          setShowPrereqConfirm(false);
          setPendingCourseAdd(null);
          setPrereqWarning(null);
        }}
        onConfirm={() => void handleProceedWithWarning()}
      />

      {loadingInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-panel-bg p-5 rounded-3xl flex items-center justify-center">
            <Icon name="loader" color="currentColor" width={24} height={24} className="animate-spin text-text-primary" />
          </div>
        </div>
      )}

      {selectedCourseInfo && (
        <div className="fixed z-50 flex items-center justify-center lg:inset-0 lg:bg-black/50 lg:p-4 max-lg:inset-x-0 max-lg:top-14 max-lg:bottom-0 max-lg:pt-0 max-lg:p-3" onClick={() => { setSelectedCourseInfo(null); setSelectedCourseMissingRequirements([]); }}>
          <div className="bg-panel-bg p-6 rounded-3xl shadow-xl max-lg:shadow-none max-w-md w-full max-h-[80dvh] overflow-y-auto max-lg:max-w-none max-lg:h-full max-lg:max-h-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold text-heading">{selectedCourseInfo.courseCode}</h2>
                {selectedCourseInfo.title && (
                  <p className="mt-1 text-sm text-text-muted">{selectedCourseInfo.title}</p>
                )}
              </div>
              <button onClick={() => { setSelectedCourseInfo(null); setSelectedCourseMissingRequirements([]); }} className="text-text-muted hover:text-text-secondary cursor-pointer">
                <Icon name="x" color="currentColor" width={24} height={24} />
              </button>
            </div>

            <div className="space-y-4">
              {selectedCourseInfo.description && (
                <div>
                  <h3 className="font-semibold text-text-primary mb-2 border-b border-panel-border pb-1">Description</h3>
                  <p className="text-sm text-text-secondary leading-6">{selectedCourseInfo.description}</p>
                </div>
              )}

              {(selectedCourseInfo.prerequisites.length > 0 || selectedCourseInfo.corequisites.length > 0 || selectedCourseInfo.otherRequirements.length > 0) && (
                <div>
                  <div className="mb-3 border-b border-panel-border pb-1">
                    <div className="inline-flex items-start gap-1">
                      <h3 className="font-semibold text-text-primary">Enrollment Requirements</h3>
                      <div className="relative w-4 h-4 mt-0.5">
                        <button
                          ref={infoButtonRef}
                          onClick={handleInfoClick}
                          onMouseEnter={handleInfoMouseEnter}
                          onMouseLeave={handleInfoMouseLeave}
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
                    {selectedCourseInfo.prerequisites.length > 0 && (
                      <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Prerequisites</h4>
                        <div className="space-y-2">
                          {selectedCourseInfo.prerequisites.map((requirement, i) => {
                            const formattedRequirement = formatEnrollmentRequirement(requirement);
                            const isUnsatisfied = isDisplayedRequirementUnsatisfied(
                              requirement,
                              selectedCourseMissingRequirements.filter((missingRequirement) => missingRequirement.requisiteType === 'prerequisite')
                            );
                            return (
                              <div
                                key={`${selectedCourseInfo.courseCode}-prerequisite-${i}`}
                                className={`rounded-xl border px-3 py-2 ${
                                  isUnsatisfied
                                    ? 'border-red-500/40 bg-red-500/10'
                                    : 'border-panel-border bg-hover-bg/40'
                                }`}
                              >
                                <div className="mb-1 flex items-center gap-2">
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                                    isUnsatisfied ? 'bg-red-500/15 text-red-600' : 'bg-text-muted/10 text-text-secondary'
                                  }`}>
                                    {formattedRequirement.label}
                                  </span>
                                </div>
                                <p className="text-sm text-text-secondary leading-6">{formattedRequirement.value}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {selectedCourseInfo.corequisites.length > 0 && (
                      <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Corequisites</h4>
                        <div className="space-y-2">
                          {selectedCourseInfo.corequisites.map((requirement, i) => {
                            const formattedRequirement = formatEnrollmentRequirement(requirement);
                            const isUnsatisfied = isDisplayedRequirementUnsatisfied(
                              requirement,
                              selectedCourseMissingRequirements.filter((missingRequirement) => missingRequirement.requisiteType === 'corequisite')
                            );
                            return (
                              <div
                                key={`${selectedCourseInfo.courseCode}-corequisite-${i}`}
                                className={`rounded-xl border px-3 py-2 ${
                                  isUnsatisfied
                                    ? 'border-red-500/40 bg-red-500/10'
                                    : 'border-panel-border bg-hover-bg/40'
                                }`}
                              >
                                <div className="mb-1 flex items-center gap-2">
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                                    isUnsatisfied ? 'bg-red-500/15 text-red-600' : 'bg-text-muted/10 text-text-secondary'
                                  }`}>
                                    {formattedRequirement.label}
                                  </span>
                                </div>
                                <p className="text-sm text-text-secondary leading-6">{formattedRequirement.value}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {selectedCourseInfo.otherRequirements.length > 0 && (
                      <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Other Requirements</h4>
                        <div className="space-y-2">
                          {selectedCourseInfo.otherRequirements.map((requirement, i) => {
                            const formattedRequirement = formatEnrollmentRequirement(requirement);
                            const isUnsatisfied = isDisplayedRequirementUnsatisfied(
                              requirement,
                              selectedCourseMissingRequirements.filter((missingRequirement) => missingRequirement.requisiteType === 'other')
                            );
                            return (
                              <div
                                key={`${selectedCourseInfo.courseCode}-other-requirement-${i}`}
                                className={`rounded-xl border px-3 py-2 ${
                                  isUnsatisfied
                                    ? 'border-red-500/40 bg-red-500/10'
                                    : 'border-panel-border bg-hover-bg/40'
                                }`}
                              >
                                <div className="mb-1 flex items-center gap-2">
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                                    isUnsatisfied ? 'bg-red-500/15 text-red-600' : 'bg-text-muted/10 text-text-secondary'
                                  }`}>
                                    {formattedRequirement.label}
                                  </span>
                                </div>
                                <p className="text-sm text-text-secondary leading-6">{formattedRequirement.value}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedCourseInfo.terms.length > 0 && (
                <div>
                  <h3 className="font-semibold text-text-primary mb-2 border-b border-panel-border pb-1">Available Terms</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedCourseInfo.terms.map((term, i) => (
                      <span key={i} className="inline-flex items-center rounded-full border border-panel-border-strong px-2.5 py-1 text-xs font-medium text-text-secondary">
                        {term}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {!selectedCourseInfo.title && !selectedCourseInfo.description && selectedCourseInfo.prerequisites.length === 0 && selectedCourseInfo.corequisites.length === 0 && selectedCourseInfo.otherRequirements.length === 0 && selectedCourseInfo.terms.length === 0 && (
                <p className="text-gray-500 italic text-sm">No course details were found for this course in the current catalog data.</p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
