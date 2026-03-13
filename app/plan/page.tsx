"use client";

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmModal from '../components/ConfirmModal';
import {
  addCourseToSemester,
  createNewPlan,
  deletePlan,
  generatePreliminaryPlan,
  getCourseCreditsFromCSV,
  getCourseInfoFromCSV,
  getPlanBuilderData,
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

export default function PlanBuilderPage() {
  const router = useRouter();
  const isMountedRef = useRef(true);
  const [userId, setUserId] = useState('');
  const [optimisticPlans, setOptimisticPlans] = useState<PlanItem[]>([]);
  const [allCourses, setAllCourses] = useState<string[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [isPlanDropdownOpen, setIsPlanDropdownOpen] = useState(false);
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
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const loadData = async () => {
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

      const validSelection = nextPlans.find((p) => p.id === selectedPlanId)?.id;
      const fallbackSelection = nextPlans[0]?.id ?? '';
      const nextSelected = validSelection || fallbackSelection;
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
      setSelectedPlanId(res.planId);
      await loadData();
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

  const selectedPlanLabel = optimisticPlans.find((p) => p.id === selectedPlanId)?.title || 'Select plan';

  if (!dataLoaded) {
    return (
      <div className="max-w-5xl mx-auto py-8 animate-pulse">
        <div className="mb-6 border-b border-panel-border pb-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="h-9 w-56 rounded bg-input-disabled" />
            <div className="h-[42px] w-full sm:w-[260px] rounded bg-input-disabled" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="h-[42px] w-24 rounded bg-input-disabled" />
            <div className="h-[42px] w-28 rounded bg-input-disabled" />
            <div className="h-[42px] w-24 rounded bg-input-disabled" />
            <div className="h-[42px] w-28 rounded bg-input-disabled" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-panel-bg border border-panel-border rounded-lg p-5 min-h-[150px] space-y-3">
              <div className="h-6 w-40 rounded bg-input-disabled" />
              <div className="h-10 w-full rounded bg-input-disabled" />
              <div className="h-10 w-full rounded bg-input-disabled" />
              <div className="h-10 w-36 rounded bg-input-disabled" />
            </div>
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
          <div className="relative w-full sm:w-auto sm:min-w-[260px]">
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
              className="w-full px-3 py-2 border border-panel-border rounded bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{selectedPlanLabel}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 ml-2 transition-transform ${isPlanDropdownOpen ? 'rotate-180' : ''}`}>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {isPlanDropdownOpen && optimisticPlans.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-panel-bg border border-panel-border-strong rounded-md max-h-48 overflow-y-auto">
                {optimisticPlans.map((p) => (
                  <div
                    key={p.id}
                    onMouseEnter={() => setHoveredPlanId(p.id)}
                    onMouseLeave={() => setHoveredPlanId(null)}
                    className={`px-3 py-2 text-sm cursor-pointer transition-colors ${selectedPlanId === p.id && (hoveredPlanId === null || hoveredPlanId === p.id) ? 'bg-uva-blue text-white' : 'text-text-primary hover:bg-uva-blue hover:text-white'}`}
                    onClick={() => {
                      setSelectedPlanId(p.id);
                      setHoveredPlanId(null);
                      setIsPlanDropdownOpen(false);
                    }}
                  >
                    {p.title}
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCreatePlan}
            disabled={creatingPlan}
            className="px-4 py-2 border border-panel-border-strong text-text-primary rounded hover:bg-hover-bg font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creatingPlan ? 'Creating...' : 'New Plan'}
          </button>

          <button
            onClick={requestDeletePlan}
            disabled={!activePlan || deletingPlan}
            className="px-4 py-2 border border-red-400 text-red-500 rounded hover:bg-red-500/10 font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deletingPlan ? 'Deleting...' : 'Delete Plan'}
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="px-4 py-2 border border-panel-border-strong text-text-primary rounded hover:bg-hover-bg font-semibold transition-colors cursor-pointer"
          >
            Settings
          </button>

          <button className="px-4 py-2 bg-uva-orange text-white rounded hover:bg-[#cc6600] font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed">
            Publish Plan
          </button>
        </div>
      </div>

      <div>
        {!activePlan ? (
          <div className="p-8 text-center text-gray-500">No plan found. Click New Plan to get started.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activePlan.semesters.map((sem) => (
              <div key={sem.id} className="bg-panel-bg border border-panel-border rounded-lg p-5 min-h-[150px]">
                <div className="flex justify-between items-center border-b border-panel-border pb-2 mb-3">
                  <h3 className="font-bold text-lg text-heading ">
                    {sem.termName} {sem.year}
                  </h3>
                  <span className="text-xs font-semibold bg-input-disabled px-2 py-1 rounded text-text-secondary">
                    {sem.courses.reduce((acc, c) => acc + (c.credits ?? 0), 0)} cr
                  </span>
                </div>
                <div className="space-y-2">
                  {sem.courses.map((course) => (
                    <div key={course.id} onClick={() => handleCourseClick(course.courseCode)} className="px-3 bg-panel-bg-alt border border-panel-border-strong rounded-md text-sm flex justify-between items-center hover:border-uva-blue transition-colors cursor-pointer group h-[46px]">
                      <span className="font-medium text-text-primary">{course.courseCode}</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-gray-500 font-semibold">{course.credits ?? 0} cr</span>
                        <button onClick={(e) => { e.stopPropagation(); void handleRemoveCourse(course.id); }} className="text-red-500 opacity-0 group-hover:opacity-100 font-bold px-1 transition-opacity cursor-pointer hover:bg-danger-bg-hover rounded">
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
                          className="w-full px-3 border border-panel-border-strong rounded-md text-sm bg-panel-bg text-text-primary focus:outline-none focus:ring-1 focus:ring-uva-blue h-full"
                        />
                        {showDropdown && filteredCourses.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-panel-bg border border-panel-border-strong rounded-md max-h-48 overflow-y-auto">
                            {filteredCourses.map((c) => (
                              <div
                                key={c}
                                className="px-3 py-2 text-sm text-text-primary hover:bg-uva-blue hover:text-white hover:bg-uva-blue transition-colors cursor-pointer"
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
                        )}
                      </div>
                      <input
                        type="number"
                        placeholder="Cr"
                        value={credits}
                        readOnly
                        className="w-1/4 px-3 border border-panel-border-strong rounded-md text-sm bg-input-disabled text-text-muted cursor-not-allowed focus:outline-none h-full"
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
                    <button onClick={() => setNewCourseSem(sem.id)} className="mt-2 text-sm font-semibold text-gray-500 hover:text-uva-orange hover:border-uva-orange hover:bg-hover-bg hover:text-uva-orange hover:border-uva-orange w-full text-center px-3 border border-dashed border-panel-border-strong rounded-md transition-all cursor-pointer disabled:cursor-not-allowed h-[46px] flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mr-1"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Course
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setIsSettingsOpen(false)}>
          <div className="bg-panel-bg-alt border border-panel-border rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
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
                className="w-full px-3 py-2 border border-panel-border rounded-md bg-input-bg text-text-primary outline-none"
                disabled={!activePlan}
              />
              <button
                onClick={() => void handleRenamePlan()}
                disabled={!activePlan || savingTitle}
                className="w-full border border-panel-border-strong py-2 rounded font-semibold text-text-primary hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingTitle ? 'Saving...' : 'Save Name'}
              </button>
            </div>

            <button
              onClick={() => void handleGenerate()}
              disabled={loading || !userId}
              className="w-full bg-uva-blue flex justify-center text-white py-2.5 rounded font-bold hover:bg-uva-blue-dark transition-colors mt-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? 'Generating...' : 'Auto-Generate CSV Plan'}
            </button>
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

      {loadingInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-panel-bg p-6 rounded-lg flex items-center space-x-3">
            <svg className="animate-spin h-5 w-5 text-uva-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <span className="font-medium text-text-primary">Loading course info...</span>
          </div>
        </div>
      )}

      {selectedCourseInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedCourseInfo(null)}>
          <div className="bg-panel-bg p-6 rounded-lg max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
