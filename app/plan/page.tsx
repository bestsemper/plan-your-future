"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmModal from '../components/ConfirmModal';
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
} from '../actions';

interface CourseInfo {
  courseCode: string;
  programs: string[];
  fulfills: string[];
}

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

export default function PlanBuilderPage() {
  const router = useRouter();
  const isMountedRef = useRef(true);
  const [userId, setUserId] = useState('');
  const [optimisticPlans, setOptimisticPlans] = useState<PlanItem[]>([]);
  const [allCourses, setAllCourses] = useState<string[]>([]);
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRenamePlanOpen, setIsRenamePlanOpen] = useState(false);
  const [importMode, setImportMode] = useState<'new' | 'overwrite'>('new');
  const [importNewPlanTitle, setImportNewPlanTitle] = useState('');
  const [importOverwritePlanId, setImportOverwritePlanId] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImportPlanDropdownOpen, setIsImportPlanDropdownOpen] = useState(false);
  const [importingPdf, setImportingPdf] = useState(false);

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
      setUserId(res.userId ?? '');
      setOptimisticPlans(nextPlans);
      setAllCourses(res.allCourses ?? []);

      const preferredSelection = preferredPlanId ? nextPlans.find((p) => p.id === preferredPlanId)?.id : undefined;
      const validSelection = nextPlans.find((p) => p.id === selectedPlanId)?.id;
      const fallbackSelection = nextPlans[0]?.id ?? '';
      const nextSelected = preferredSelection || validSelection || fallbackSelection;
      setSelectedPlanId(nextSelected);

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

  const activePlan = optimisticPlans.find((p) => p.id === selectedPlanId) || optimisticPlans[0];

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
    ? allCourses.filter((c) => c.toLowerCase().includes(courseCode.toLowerCase()))
    : [];

  const handleGenerate = async () => {
    if (!userId) return;
    setLoading(true);
    await generatePreliminaryPlan(userId, 'Computer Science (BA)', []);
    setLoading(false);
    await loadData();
  };

  const handleCreatePlan = async () => {
    setCreatingPlan(true);
    const res = await createNewPlan();
    setCreatingPlan(false);
    if (!res?.error && res?.planId) {
      await loadData(res.planId);
    }
  };

  const handleRenamePlan = async () => {
    if (!activePlan?.id) return;
    setSavingTitle(true);
    await renamePlan(activePlan.id, planTitle);
    setSavingTitle(false);
    await loadData();
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
    await loadData();
  };

  const handleCourseSearchChange = (value: string) => {
    setCourseCode(value);
    setShowDropdown(true);

    if (allCourses.includes(value)) {
      getCourseCreditsFromCSV(value).then((res) => setCredits(res));
    }
  };

  const handleAddCourse = async (semesterId: string) => {
    if (!courseCode) return;
    const code = courseCode;
    const cr = Number.parseInt(credits, 10);

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

    await addCourseToSemester(semesterId, code, cr);
    await loadData();
  };

  const handleRemoveCourse = async (courseId: string) => {
    setOptimisticPlans((prev) =>
      prev.map((p) => ({
        ...p,
        semesters: p.semesters.map((s) => ({
          ...s,
          courses: s.courses.filter((c) => c.id !== courseId),
        })),
      }))
    );

    await removeCourseFromSemester(courseId);
    await loadData();
  };

  const handleCourseClick = async (code: string) => {
    setLoadingInfo(true);
    const info = await getCourseInfoFromCSV(code);
    setSelectedCourseInfo(info);
    setLoadingInfo(false);
  };

  const handleAddSemester = async (schoolYearStart: number, termName: 'Fall' | 'Winter' | 'Spring' | 'Summer') => {
    if (!activePlan?.id) return;
    setSemesterActionError(null);
    setUpdatingSemester(true);
    const res = await addSemesterToPlan(activePlan.id, schoolYearStart, termName);
    setUpdatingSemester(false);
    if (res?.error) {
      setSemesterActionError(res.error);
      return;
    }
    await loadData();
  };

  const requestDeleteSemester = (semesterId: string, label: string) => {
    setSemesterToDelete({ id: semesterId, label });
    setIsDeleteSemesterConfirmOpen(true);
  };

  const handleDeleteSemester = async () => {
    if (!semesterToDelete) return;
    setIsDeleteSemesterConfirmOpen(false);
    setSemesterActionError(null);
    setUpdatingSemester(true);
    const res = await deleteSemesterFromPlan(semesterToDelete.id);
    setUpdatingSemester(false);
    if (res?.error) {
      setSemesterActionError(res.error);
      return;
    }
    setSemesterToDelete(null);
    await loadData();
  };

  const handleAddYear = async () => {
    if (!activePlan?.id) return;
    setSemesterActionError(null);
    setUpdatingYear(true);
    const res = await addSchoolYearToPlan(activePlan.id);
    setUpdatingYear(false);
    if (res?.error) {
      setSemesterActionError(res.error);
      return;
    }
    await loadData();
  };

  const requestDeleteYear = (schoolYearStart: number) => {
    setYearToDelete(schoolYearStart);
    setIsDeleteYearConfirmOpen(true);
  };

  const handleDeleteYear = async () => {
    if (!activePlan?.id || yearToDelete === null) return;
    setIsDeleteYearConfirmOpen(false);
    setSemesterActionError(null);
    setUpdatingYear(true);
    const res = await deleteSchoolYearFromPlan(activePlan.id, yearToDelete);
    setUpdatingYear(false);
    if (res?.error) {
      setSemesterActionError(res.error);
      return;
    }
    setYearToDelete(null);
    await loadData();
  };

  const handleImportFromPdf = async () => {
    if (!importFile) {
      setImportError('Please choose a Stellic PDF file.');
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
        newPlanTitle: importMode === 'new' ? importNewPlanTitle : undefined,
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
      setImportingPdf(false);
      await loadData(res?.planId);
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
      <div className="max-w-5xl mx-auto py-8 animate-pulse">
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
                  <div key={si} className="bg-panel-bg border border-panel-border rounded-lg p-5 min-h-[180px]">
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
    <div className="max-w-5xl mx-auto py-8">
      <div className="mb-6 border-b border-panel-border pb-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-3xl font-bold text-heading">Plan Builder</h1>

          <div className="flex w-full sm:w-auto sm:min-w-[320px] items-center gap-2">
            <div className="relative flex-1">
              <button
                type="button"
                onClick={() => {
                  setIsPlanDropdownOpen((prev) => !prev);
                  setHoveredPlanId(null);
                }}
                onBlur={() =>
                  setTimeout(() => {
                    setIsPlanDropdownOpen(false);
                    setHoveredPlanId(null);
                  }, 150)
                }
                disabled={optimisticPlans.length === 0}
                className="w-full px-4 py-2.5 border border-panel-border rounded-xl bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none hover:border-panel-border-strong"
              >
                <span className="truncate text-sm font-medium">{selectedPlanLabel}</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 ml-2 shrink-0 text-text-secondary transition-transform duration-200 ${isPlanDropdownOpen ? 'rotate-180' : ''}`}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {isPlanDropdownOpen && optimisticPlans.length > 0 && (
                <div className="absolute z-10 w-full mt-1.5 bg-panel-bg border border-panel-border rounded-xl shadow-lg overflow-hidden">
                  <div className="max-h-48 overflow-y-auto p-1.5 space-y-0.5">
                    {optimisticPlans.map((p) => {
                      const isSelected = selectedPlanId === p.id;
                      return (
                        <div
                          key={p.id}
                          onMouseEnter={() => setHoveredPlanId(p.id)}
                          onMouseLeave={() => setHoveredPlanId(null)}
                          className={`px-3 py-2 text-sm cursor-pointer rounded-lg transition-colors flex items-center justify-between gap-2 ${isSelected ? 'bg-uva-blue/10 text-uva-blue font-semibold' : 'text-text-primary hover:bg-hover-bg'}`}
                          onClick={() => {
                            setSelectedPlanId(p.id);
                            setHoveredPlanId(null);
                            setIsPlanDropdownOpen(false);
                          }}
                        >
                          <span className="truncate">{p.title}</span>
                          {isSelected && (
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0 text-uva-blue">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

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
                  <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
                    {orderedTerms.map((term) => {
                      const sem = row.terms[term];
                      if (!sem) return null;

                      return (
                        <div key={sem.id} className="bg-panel-bg border border-panel-border rounded-lg p-5 min-h-[150px]">
                          <div className="flex justify-between items-center border-b border-panel-border pb-2 mb-3">
                            <h3 className="font-bold text-lg text-heading">
                              {sem.termName} {sem.year}
                            </h3>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold bg-input-disabled px-2 py-1 rounded text-text-secondary">
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
                            {sem.courses.map((course) => (
                              <div key={course.id} onClick={() => handleCourseClick(course.courseCode)} className="px-3 bg-panel-bg-alt border border-panel-border-strong rounded-lg text-sm flex justify-between items-center hover:border-uva-blue transition-colors cursor-pointer group h-[46px]">
                                <span className="font-medium text-text-primary">{course.courseCode}</span>
                                <div className="flex items-center space-x-2">
                                  <span className="text-gray-500 font-semibold">{course.credits ?? 0} cr</span>
                                  <button onClick={(e) => { e.stopPropagation(); void handleRemoveCourse(course.id); }} className="text-red-500 opacity-0 group-hover:opacity-100 font-bold px-1 transition-opacity cursor-pointer rounded">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                  </button>
                                </div>
                              </div>
                            ))}

                            {newCourseSem === sem.id ? (
                              <div className="flex space-x-2 mt-2 relative h-[46px] items-stretch">
                                <div className="w-1/2 relative h-full">
                                  <input
                                    type="text"
                                    placeholder="Course Code"
                                    value={courseCode}
                                    onChange={(e) => handleCourseSearchChange(e.target.value)}
                                    onFocus={() => setShowDropdown(true)}
                                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                                    className="w-full px-3 border border-panel-border-strong rounded-xl text-sm bg-panel-bg text-text-primary focus:outline-none h-full"
                                  />
                                  {showDropdown && filteredCourses.length > 0 && (
                                    <div className="absolute z-10 w-full mt-1.5 bg-panel-bg border border-panel-border rounded-xl shadow-lg overflow-hidden">
                                      <div className="max-h-48 overflow-y-auto p-1.5 space-y-0.5">
                                      {filteredCourses.map((c) => (
                                        <div
                                          key={c}
                                          className="px-3 py-2 text-sm text-text-primary rounded-lg hover:bg-hover-bg transition-colors cursor-pointer"
                                          onClick={() => {
                                            setCourseCode(c);
                                            getCourseCreditsFromCSV(c).then((res) => setCredits(res));
                                            setShowDropdown(false);
                                          }}
                                        >
                                          {c}
                                        </div>
                                      ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <input
                                  type="number"
                                  placeholder="Cr"
                                  value={credits}
                                  readOnly
                                  className="w-1/4 px-3 border border-panel-border-strong rounded-xl text-sm bg-input-disabled text-text-muted cursor-not-allowed focus:outline-none h-full"
                                />
                                <div className="flex items-center space-x-1 px-1">
                                  <button onClick={() => void handleAddCourse(sem.id)} className="text-success-text hover:text-success-text-hover p-2 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center transition-all hover:scale-110">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><polyline points="20 6 9 17 4 12"/></svg>
                                  </button>
                                  <button onClick={() => setNewCourseSem(null)} className="text-danger-text hover:text-danger-text-hover p-2 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center transition-all hover:scale-110">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => setNewCourseSem(sem.id)} className="mt-2 text-sm font-semibold text-gray-500 hover:text-uva-orange hover:border-uva-orange hover:bg-hover-bg hover:text-uva-orange hover:border-uva-orange w-full text-center px-3 border border-dashed border-panel-border-strong rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed h-[46px] flex items-center justify-center">
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

      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setIsSettingsOpen(false)}>
          <div className="bg-panel-bg-alt border border-panel-border rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-xl text-heading">Settings</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-text-muted hover:text-text-secondary cursor-pointer" aria-label="Close settings">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <div className="space-y-2 mb-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary">Plan Name</label>
              <input
                type="text"
                value={planTitle}
                onChange={(e) => setPlanTitle(e.target.value)}
                className="w-full px-3 py-2 border border-panel-border rounded-xl bg-input-bg text-text-primary outline-none"
                disabled={!activePlan}
              />
              <button
                onClick={() => void handleRenamePlan()}
                disabled={!activePlan || savingTitle}
                className="w-full border border-panel-border-strong py-2 rounded-xl font-semibold text-text-primary hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingTitle ? 'Saving...' : 'Save Name'}
              </button>
            </div>

            <button
              onClick={() => void handleGenerate()}
              disabled={loading || !userId}
              className="w-full bg-uva-blue/90 flex justify-center text-white py-2.5 rounded-xl font-bold hover:bg-uva-blue transition-colors mt-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? 'Generating...' : 'Auto-Generate CSV Plan'}
            </button>

            <div className="mt-4 pt-4 border-t border-panel-border space-y-3">
              <h3 className="text-sm font-semibold text-heading">Import Plan PDF</h3>

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
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsImportPlanDropdownOpen((prev) => !prev)}
                    onBlur={() =>
                      setTimeout(() => {
                        setIsImportPlanDropdownOpen(false);
                      }, 150)
                    }
                    className="w-full px-4 py-2.5 border border-panel-border rounded-xl bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between hover:border-panel-border-strong transition-colors"
                  >
                      <span className="truncate text-sm font-medium">{importPlanLabel}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 text-text-secondary transition-transform duration-200 ${isImportPlanDropdownOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
                  </button>

                  {isImportPlanDropdownOpen && (
                      <div className="absolute z-10 mt-1.5 w-full rounded-xl border border-panel-border bg-panel-bg shadow-lg overflow-hidden">
                        <div className="max-h-40 overflow-y-auto p-1.5 space-y-0.5">
                      {optimisticPlans.map((plan) => (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => {
                            setImportOverwritePlanId(plan.id);
                            setIsImportPlanDropdownOpen(false);
                          }}
                            className={`w-full px-3 py-2 text-left text-sm rounded-lg cursor-pointer transition-colors ${importOverwritePlanId === plan.id ? 'bg-uva-blue/10 text-uva-blue font-semibold' : 'text-text-primary hover:bg-hover-bg'}`}
                        >
                          {plan.title}
                        </button>
                      ))}
                        </div>
                    </div>
                  )}
                </div>
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
                className="w-full px-4 py-2 bg-uva-orange/90 text-white rounded-xl hover:bg-uva-orange font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importingPdf ? 'Importing...' : 'Import PDF'}
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

      {loadingInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-panel-bg p-6 rounded-2xl flex items-center space-x-3">
            <svg className="animate-spin h-5 w-5 text-uva-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <span className="font-medium text-text-primary">Loading course info...</span>
          </div>
        </div>
      )}

      {selectedCourseInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedCourseInfo(null)}>
          <div className="bg-panel-bg p-6 rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-2xl font-bold text-heading">{selectedCourseInfo.courseCode}</h2>
              <button onClick={() => setSelectedCourseInfo(null)} className="text-text-muted hover:text-text-secondary cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <div className="space-y-4">
              {selectedCourseInfo.programs.length > 0 && (
                <div>
                  <h3 className="font-semibold text-text-primary mb-2 border-b border-panel-border pb-1">Programs Requirements</h3>
                  <ul className="list-disc list-inside text-sm text-text-secondary space-y-1">
                    {selectedCourseInfo.programs.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedCourseInfo.fulfills.length > 0 && (
                <div>
                  <h3 className="font-semibold text-text-primary mb-2 border-b border-panel-border pb-1">Fulfills Attributes/Reqs</h3>
                  <ul className="list-disc list-inside text-sm text-text-secondary space-y-1">
                    {selectedCourseInfo.fulfills.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedCourseInfo.programs.length === 0 && selectedCourseInfo.fulfills.length === 0 && (
                <p className="text-gray-500 italic text-sm">No specific requirement information found in audit data.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
