"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { RequirementMissing } from '../utils/prerequisiteChecker';
import { default as ConfirmModal } from '../components/ConfirmModal';
import { CustomDropdown, CustomDropdownContent, CustomDropdownItem } from '../components/CustomDropdown';
import {
  addSchoolYearToPlan,
  addSemesterToPlan,
  addCourseToSemester,
  createNewPlan,
  deleteSchoolYearFromPlan,
  deleteSemesterFromPlan,
  deletePlan,
  generatePreliminaryPlan,
  getCourseCreditsFromCSV,
  getCourseInfoFromCSV,
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
  credits: number | null;
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
  const prefixMatch = trimmed.match(/^(Major Restriction|Program Restriction|Year Requirement|School Requirement|Credit Requirement):\s*(.+)$/i);

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
    blue: 'bg-uva-blue/10 text-uva-blue',
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
            <div key={`${title}-${index}`} className="rounded-xl border border-panel-border bg-panel-bg-alt px-3 py-2">
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

export default function PlanBuilderPage() {
  const router = useRouter();
  const isMountedRef = useRef(true);
  const lastPlanPrereqCheckKeyRef = useRef('');
  const newCourseInputRef = useRef<HTMLInputElement | null>(null);
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
  const [courseCode, setCourseCode] = useState('');
  const [credits, setCredits] = useState('3');
  const [showDropdown, setShowDropdown] = useState(false);
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

  // Prerequisite tracking
  const [completedCourses, setCompletedCourses] = useState<string[]>([]);
  const [prereqWarning, setPrereqWarning] = useState<{ type: 'info' | 'warning' | 'error'; message: string; missingCourses?: string[]; detailedRequirements?: RequirementMissing[]; detailedPrerequisiteRequirements?: RequirementMissing[]; detailedCorequisiteRequirements?: RequirementMissing[]; detailedOtherRequirements?: RequirementMissing[] } | null>(null);
  const [showPrereqConfirm, setShowPrereqConfirm] = useState(false);
  const [pendingCourseAdd, setPendingCourseAdd] = useState<{ semesterId: string; courseCode: string; credits: number } | null>(null);
  // Map of semesterId -> Map of courseCode -> missing prerequisite codes
  const [semestersProblematicCourses, setSemestersProblematicCourses] = useState<Map<string, Map<string, RequirementMissing[]>>>(new Map());

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

  const activePlan = optimisticPlans.find((p) => p.id === selectedPlanId) || optimisticPlans[0];

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
          courseEntries.set(courseCode, requirements as RequirementMissing[]);
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

          // If one starts with search and the other doesn't, put the one that starts first
          if (aStartsWith && !bStartsWith) return -1;
          if (!aStartsWith && bStartsWith) return 1;

          // Both start with search or neither does - sort alphabetically
          return a.code.localeCompare(b.code);
        })
    : [];

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

  const handleCourseSearchChange = (value: string) => {
    setCourseCode(value);
    setShowDropdown(true);
    setPrereqWarning(null); // Clear any previous prerequisite warnings

    if (allCourses.some((course) => course.code === value)) {
      getCourseCreditsFromCSV(value).then((res) => setCredits(res));
    }
  };

  const handleAddCourse = async (semesterId: string) => {
    if (!courseCode || !activePlan) return;
    
    const code = courseCode.toUpperCase();
    const cr = Number.parseInt(credits, 10);

    // Find the current semester to get termOrder
    const currentSem = activePlan.semesters.find((s) => s.id === semesterId);
    if (!currentSem) return;

    // Check prerequisites
    const result = await checkCoursePrerequisites({
      courseCode: code,
      completedCourses,
      planSemesters: activePlan.semesters,
      currentSemesterTermOrder: currentSem.termOrder,
      currentSemesterCourseCodes: currentSem.courses.map((courseInSemester) => courseInSemester.courseCode),
    });

    // Handle the prerequisite result
    if (result.isSatisfied) {
      // Prerequisites are satisfied, proceed with adding course
      setPrereqWarning(null);
      addCourseOptimistically(semesterId, code, cr);
    } else if (result.hasNoPrerequisites && result.hasNoCorequisites && result.hasNoOtherRequirements && result.hasUnknownPrerequisites) {
      // No prerequisites found but not 1000-level - show soft warning
      setPrereqWarning({
        type: 'info',
        message: `${code} might have enrollment requirements we don't have in our system (it's not a 1000-level course). It's been added anyway.`,
      });
      addCourseOptimistically(semesterId, code, cr);
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
      return;
    }
  };

  const addCourseOptimistically = (semesterId: string, code: string, cr: number) => {
    setOptimisticPlans((prev) =>
      prev.map((p) => ({
        ...p,
        semesters: p.semesters.map((s) =>
          s.id === semesterId
            ? {
                ...s,
                courses: [...s.courses, { id: `temp-${Date.now()}`, courseCode: code, credits: cr }],
              }
            : s
        ),
      }))
    );

    setNewCourseSem(null);
    setCourseCode('');
    setCredits('3');
    setPrereqWarning(null);

    void addCourseToSemesterAsync(semesterId, code, cr);
  };

  const addCourseToSemesterAsync = async (semesterId: string, code: string, cr: number) => {
    await addCourseToSemester(semesterId, code, cr);
    void loadData();
  };

  const handleProceedWithWarning = () => {
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
    
    addCourseOptimistically(pendingCourseAdd.semesterId, pendingCourseAdd.courseCode, pendingCourseAdd.credits);
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
    const info = await getCourseInfoFromCSV(code);
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
                  <div key={si} className="bg-panel-bg border border-panel-border rounded-xl p-5 min-h-[180px]">
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
            <CustomDropdown
              isOpen={isPlanDropdownOpen}
              onOpenChange={(open) => {
                setIsPlanDropdownOpen(open);
                if (!open) setHoveredPlanId(null);
              }}
              disabled={optimisticPlans.length === 0}
              trigger={
                <button
                  type="button"
                  disabled={optimisticPlans.length === 0}
                  className="w-full px-4 py-2.5 border border-panel-border rounded-xl bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none hover:border-panel-border-strong"
                >
                  <span className="truncate text-sm font-medium">{selectedPlanLabel}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 ml-2 shrink-0 text-text-secondary transition-transform duration-200 ${isPlanDropdownOpen ? 'rotate-180' : ''}`}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              }
            >
              <CustomDropdownContent>
                {optimisticPlans.map((p) => {
                  const isSelected = selectedPlanId === p.id;
                  return (
                    <CustomDropdownItem
                      key={p.id}
                      selected={isSelected}
                      onClick={() => {
                        setSelectedPlanId(p.id);
                        setHoveredPlanId(null);
                        setIsPlanDropdownOpen(false);
                      }}
                    >
                      {p.title}
                    </CustomDropdownItem>
                  );
                })}
              </CustomDropdownContent>
            </CustomDropdown>

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsMoreMenuOpen((prev) => !prev)}
                onBlur={() =>
                  setTimeout(() => {
                    setIsMoreMenuOpen(false);
                  }, 150)
                }
                className="inline-flex items-center justify-center w-10 h-10 rounded-full text-text-primary hover:bg-hover-bg transition-colors cursor-pointer"
                aria-label="More plan actions"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
              </button>

              {isMoreMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-panel-border bg-panel-bg shadow-lg z-20 p-1.5 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      void handleCreatePlan();
                      setIsMoreMenuOpen(false);
                    }}
                    disabled={creatingPlan}
                    className="w-full px-3 py-2 rounded-lg text-left text-sm text-text-primary hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2.5"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-secondary"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    {creatingPlan ? 'Creating...' : 'New Plan'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleAddYear();
                      setIsMoreMenuOpen(false);
                    }}
                    disabled={!activePlan || updatingYear}
                    className="w-full px-3 py-2 rounded-lg text-left text-sm text-text-primary hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2.5"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-secondary"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    {updatingYear ? 'Adding Year...' : 'Add Year'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsRenamePlanOpen(true);
                      setIsMoreMenuOpen(false);
                    }}
                    disabled={!activePlan}
                    className="w-full px-3 py-2 rounded-lg text-left text-sm text-text-primary hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2.5"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-secondary"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Rename Plan
                  </button>
                  <button
                    type="button"
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
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-secondary"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="17 3 21 3 21 7"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
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
                    className="w-full px-3 py-2 rounded-lg text-left text-sm text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2.5"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                    {deletingPlan ? 'Deleting...' : 'Delete Plan'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div>
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
              const columnCount = Math.max(2, Math.min(4, orderedTerms.length));
              const gridColsClass =
                columnCount <= 2 ? 'grid-cols-1 md:grid-cols-2' :
                columnCount === 3 ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3' :
                'grid-cols-1 md:grid-cols-2 xl:grid-cols-4';
              const isCollapsed = Boolean(collapsedSchoolYears[row.startYear]);
              const totalCourses = orderedTerms.reduce((count, term) => count + (row.terms[term]?.courses.length ?? 0), 0);
              const totalCredits = orderedTerms.reduce(
                (count, term) => count + (row.terms[term]?.courses.reduce((sum, course) => sum + (course.credits ?? 0), 0) ?? 0),
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
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}><path d="m6 9 6 6 6-6" /></svg>
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
                        className="px-3 py-1.5 text-xs font-semibold border border-red-400 text-red-500 rounded-xl hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Remove Year
                      </button>
                      {!isCollapsed && missingTerms.map((term) => (
                        <button
                          key={`${row.startYear}-${term}`}
                          type="button"
                          onClick={() => void handleAddSemester(row.startYear, term)}
                          disabled={updatingSemester}
                          className="px-3 py-1.5 text-xs font-semibold border border-panel-border-strong rounded-xl text-text-primary hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                        <div key={sem.id} className="bg-panel-bg border border-panel-border rounded-xl p-5">
                          <div className="flex justify-between items-center border-b border-panel-border pb-2 mb-3">
                            <h3 className="font-bold text-lg text-heading flex items-center gap-2">
                              {sem.termName} {sem.year}
                              {semestersProblematicCourses.has(sem.id) && (
                                <HoverTooltip message={`Courses with unsatisfied requirements\n${Array.from(semestersProblematicCourses.get(sem.id)?.keys() || []).map((courseCode) => `- ${courseCode}`).join('\n')}`}>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-yellow-500 cursor-help hover:text-yellow-600 transition-colors" aria-label="Contains course(s) with unsatisfied prerequisites">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05l-8.47-14.14a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                  </svg>
                                </HoverTooltip>
                              )}
                            </h3>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold bg-input-disabled px-2 py-1 rounded-lg text-text-secondary">
                                {sem.courses.reduce((acc, c) => acc + (c.credits ?? 0), 0)} cr
                              </span>
                              <button
                                type="button"
                                onClick={() => requestDeleteSemester(sem.id, `${sem.termName} ${sem.year}`)}
                                disabled={updatingSemester}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-full text-text-tertiary hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                aria-label={`Delete ${sem.termName} ${sem.year}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
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
                              return (
                                <div key={course.id} onClick={() => handleCourseClick(course.courseCode, requirementsMissing)} className="px-3 bg-panel-bg-alt border border-panel-border-strong rounded-xl text-sm flex justify-between items-center hover:border-uva-blue transition-colors cursor-pointer group h-[46px]">
                                  <span className="font-medium text-text-primary flex items-center gap-2">
                                    {course.courseCode}
                                    {isProblematic && (
                                      <HoverTooltip message={tooltipMessage}>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-yellow-500 flex-shrink-0 cursor-help hover:text-yellow-600 transition-colors">
                                          <circle cx="12" cy="12" r="10"/>
                                          <line x1="12" y1="8" x2="12" y2="12"/>
                                          <line x1="12" y1="16" x2="12.01" y2="16"/>
                                        </svg>
                                      </HoverTooltip>
                                    )}
                                  </span>
                                  <div className="relative flex items-center justify-end min-w-[84px] h-full pr-1">
                                    <span className="text-gray-500 font-semibold whitespace-nowrap transition-transform duration-200 group-hover:-translate-x-6">{course.credits ?? 0} cr</span>
                                    <button onClick={(e) => { e.stopPropagation(); void handleRemoveCourse(course.id); }} className="absolute right-0 text-danger-text hover:text-danger-text-hover opacity-0 translate-x-1 group-hover:opacity-100 p-2 cursor-pointer flex items-center justify-center transition-all duration-200 hover:scale-110">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}

                            {newCourseSem === sem.id ? (
                              <>
                              <div className="flex space-x-2 mt-2 relative h-[46px] items-stretch">
                                <div className="flex-1 relative h-full">
                                  <div className="h-full px-3 bg-panel-bg-alt border border-panel-border-strong rounded-xl text-sm flex items-center justify-between gap-2">
                                    <div className="flex-1 h-full">
                                      <input
                                        ref={newCourseInputRef}
                                        type="text"
                                        placeholder="Course Code"
                                        value={courseCode}
                                        onChange={(e) => handleCourseSearchChange(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            void handleAddCourse(sem.id);
                                          }
                                        }}
                                        onFocus={() => setShowDropdown(true)}
                                        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                                        className="w-full h-full bg-transparent text-text-primary focus:outline-none"
                                      />
                                    </div>
                                    <span className="text-gray-500 font-semibold whitespace-nowrap">{credits} cr</span>
                                  </div>
                                  {showDropdown && filteredCourses.length > 0 && (
                                    <div className="absolute z-10 left-0 top-full w-full mt-1.5 bg-panel-bg border border-panel-border rounded-xl shadow-lg overflow-hidden">
                                      <div className="max-h-48 overflow-y-auto p-1.5 space-y-0.5">
                                        {filteredCourses.map((course) => (
                                          <div
                                            key={course.code}
                                            className="px-3 py-2 rounded-lg hover:bg-hover-bg transition-colors cursor-pointer"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => {
                                              setCourseCode(course.code);
                                              getCourseCreditsFromCSV(course.code).then((res) => setCredits(res));
                                              setShowDropdown(false);
                                              requestAnimationFrame(() => {
                                                newCourseInputRef.current?.focus();
                                              });
                                            }}
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
                                <div className="ml-auto flex items-center justify-end space-x-1 px-1">
                                  <button onClick={() => void handleAddCourse(sem.id)} className="text-success-text hover:text-success-text-hover p-2 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center transition-all hover:scale-110">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><polyline points="20 6 9 17 4 12"/></svg>
                                  </button>
                                  <button onClick={() => { setNewCourseSem(null); setPrereqWarning(null); }} className="text-danger-text hover:text-danger-text-hover p-2 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center transition-all hover:scale-110">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                  </button>
                                </div>
                              </div>

                              {prereqWarning && (
                                <div className={`mt-2 p-3 rounded-lg text-sm ${
                                  prereqWarning.type === 'error'
                                    ? 'bg-red-500/10 border border-red-500/30 text-red-600'
                                    : 'bg-blue-500/10 border border-blue-500/30 text-blue-600'
                                }`}>
                                  {prereqWarning.type === 'error' && (
                                    <div className="flex items-start gap-2">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mt-0.5 flex-shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05l-8.47-14.14a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
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
                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mt-0.5 flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                                      <p>{prereqWarning.message}</p>
                                    </div>
                                  )}
                                </div>
                              )}
                              </>
                            ) : (
                              <button onClick={() => { setNewCourseSem(sem.id); setPrereqWarning(null); }} className="mt-2 text-sm font-semibold text-gray-500 hover:text-uva-orange hover:border-uva-orange hover:bg-hover-bg hover:text-uva-orange hover:border-uva-orange w-full text-center px-3 border border-dashed border-panel-border-strong rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed h-[46px] flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mr-1"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Course
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

      {isImportAuditOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setIsImportAuditOpen(false)}>
          <div className="bg-panel-bg-alt border border-panel-border rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-xl text-heading">Import Plan</h2>
              <button onClick={() => setIsImportAuditOpen(false)} className="text-text-muted hover:text-text-secondary cursor-pointer" aria-label="Close import plan">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Open Stellic → Plan your Path → Download Plan → Create plan report
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setImportMode('new');
                    setIsImportPlanDropdownOpen(false);
                    setImportError(null);
                  }}
                  className={`px-3 py-2 text-sm font-semibold rounded-xl border transition-colors cursor-pointer ${importMode === 'new' ? 'bg-uva-blue/90 text-white border-uva-blue' : 'border-panel-border-strong text-text-primary hover:bg-hover-bg'}`}
                >
                  New Plan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportMode('overwrite');
                    setImportOverwritePlanId((prev) => prev || activePlan?.id || '');
                    setImportError(null);
                  }}
                  className={`px-3 py-2 text-sm font-semibold rounded-xl border transition-colors cursor-pointer ${importMode === 'overwrite' ? 'bg-uva-blue/90 text-white border-uva-blue' : 'border-panel-border-strong text-text-primary hover:bg-hover-bg'}`}
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
                  className="w-full px-3 py-2 border border-panel-border rounded-xl bg-input-bg text-text-primary outline-none"
                />
              )}

              {importMode === 'overwrite' && (
                <CustomDropdown
                  isOpen={isImportPlanDropdownOpen}
                  onOpenChange={setIsImportPlanDropdownOpen}
                  trigger={
                    <button
                      type="button"
                      className="w-full px-4 py-2.5 border border-panel-border rounded-xl bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between hover:border-panel-border-strong transition-colors"
                    >
                      <span className="truncate text-sm font-medium">{importPlanLabel}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 text-text-secondary transition-transform duration-200 ${isImportPlanDropdownOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
                    </button>
                  }
                >
                  <CustomDropdownContent maxHeight="max-h-40">
                    {optimisticPlans.map((plan) => (
                      <CustomDropdownItem
                        key={plan.id}
                        selected={importOverwritePlanId === plan.id}
                        onClick={() => {
                          setImportOverwritePlanId(plan.id);
                          setIsImportPlanDropdownOpen(false);
                        }}
                      >
                        {plan.title}
                      </CustomDropdownItem>
                    ))}
                  </CustomDropdownContent>
                </CustomDropdown>
              )}

              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-text-primary file:mr-3 file:px-3 file:py-2 file:border file:border-panel-border-strong file:rounded file:bg-panel-bg-alt file:text-text-primary file:cursor-pointer"
              />

              {importError && (
                <div className="bg-red-500/10 border border-red-500/40 text-red-500 px-3 py-2 rounded text-sm font-semibold">
                  {importError}
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleImportFromPdf()}
                disabled={importingPdf}
                className="w-full px-4 py-2 bg-uva-blue/90 text-white rounded-xl hover:bg-uva-blue font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importingPdf ? 'Importing...' : 'Import Plan PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isRenamePlanOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setIsRenamePlanOpen(false)}>
          <div className="bg-panel-bg-alt border border-panel-border rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-xl text-heading">Rename Plan</h2>
              <button onClick={() => setIsRenamePlanOpen(false)} className="text-text-muted hover:text-text-secondary cursor-pointer" aria-label="Close rename plan">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary">Plan Name</label>
              <input
                type="text"
                value={planTitle}
                onChange={(e) => setPlanTitle(e.target.value)}
                className="w-full px-3 py-2 border border-panel-border rounded-xl bg-input-bg text-text-primary outline-none"
                disabled={!activePlan || savingTitle}
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsRenamePlanOpen(false)}
                  className="px-4 py-2 border border-panel-border-strong rounded-xl font-semibold text-text-primary hover:bg-hover-bg transition-colors cursor-pointer"
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
                  className="px-4 py-2 bg-uva-blue/90 text-white rounded-xl font-semibold hover:bg-uva-blue transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="bg-panel-bg p-6 rounded-2xl flex items-center space-x-3">
            <svg className="animate-spin h-5 w-5 text-uva-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <span className="font-medium text-text-primary">Loading course info...</span>
          </div>
        </div>
      )}

      {selectedCourseInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setSelectedCourseInfo(null); setSelectedCourseMissingRequirements([]); }}>
          <div className="bg-panel-bg p-6 rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold text-heading">{selectedCourseInfo.courseCode}</h2>
                {selectedCourseInfo.title && (
                  <p className="mt-1 text-sm text-text-muted">{selectedCourseInfo.title}</p>
                )}
              </div>
              <button onClick={() => { setSelectedCourseInfo(null); setSelectedCourseMissingRequirements([]); }} className="text-text-muted hover:text-text-secondary cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
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
                  <h3 className="font-semibold text-text-primary mb-2 border-b border-panel-border pb-1">Enrollment Requirements</h3>
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
                                    isUnsatisfied ? 'bg-red-500/15 text-red-600' : 'bg-uva-blue/10 text-uva-blue'
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
                                    isUnsatisfied ? 'bg-red-500/15 text-red-600' : 'bg-uva-orange/10 text-uva-orange'
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
