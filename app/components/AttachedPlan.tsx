"use client";

import { createContext, useContext, useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getAttachedPlanViewData, importAttachedPlan } from "../actions";
import { Icon } from "../components/Icon";

type PlanModalWindow = {
  id: string;
  loading: boolean;
  plan: AttachedPlanView | null;
};

type AttachedPlanModalContextValue = {
  openPlanModal: (planId: string, onError?: (message: string) => void) => void;
};

const AttachedPlanModalContext = createContext<AttachedPlanModalContextValue | null>(null);

export function useAttachedPlanModal() {
  const value = useContext(AttachedPlanModalContext);
  if (!value) {
    throw new Error('useAttachedPlanModal must be used within AttachedPlanModalProvider');
  }
  return value;
}

export default function AttachedPlanModalProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [planModals, setPlanModals] = useState<PlanModalWindow[]>([]);
  const shouldShowModals = pathname.startsWith('/forum') || pathname.startsWith('/plan');

  useEffect(() => {
    if (!shouldShowModals) {
      setPlanModals([]);
    }
  }, [shouldShowModals]);

  const openPlanModal = (planId: string, onError?: (message: string) => void) => {
    const modalId = `plan-modal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setPlanModals((prev) => [...prev, { id: modalId, loading: true, plan: null }]);

    (async () => {
      const result = await getAttachedPlanViewData(planId);
      if ('error' in result) {
        setPlanModals((prev) => prev.filter((modal) => modal.id !== modalId));
        onError?.('Unable to load attached plan.');
        return;
      }

      setPlanModals((prev) =>
        prev.map((modal) =>
          modal.id === modalId
            ? {
                ...modal,
                loading: false,
                plan: result.plan,
              }
            : modal
        )
      );
    })();
  };

  const contextValue = useMemo(() => ({ openPlanModal }), []);

  return (
    <AttachedPlanModalContext.Provider value={contextValue}>
      {children}
      {shouldShowModals &&
        planModals.map((modal, index) => (
          <AttachedPlan
            key={modal.id}
            isOpen
            loading={modal.loading}
            plan={modal.plan}
            zIndex={50 + index}
            onClose={() => {
              setPlanModals((prev) => prev.filter((item) => item.id !== modal.id));
            }}
          />
        ))}
    </AttachedPlanModalContext.Provider>
  );
}

export type AttachedPlanView = {
  id: string;
  title: string;
  ownerDisplayName: string;
  ownerComputingId: string;
  semesters: Array<{
    id: string;
    termName: string;
    termOrder: number;
    year: number;
    courses: Array<{
      id: string;
      courseCode: string;
      title: string | null;
      creditsMin: number | null;
      creditsMax: number | null;
    }>;
  }>;
};

type AttachedPlanProps = {
  isOpen: boolean;
  loading: boolean;
  plan: AttachedPlanView | null;
  onClose: () => void;
  initialPosition?: { x: number; y: number };
  zIndex?: number;
};

const DEFAULT_WIDTH = 900;
const DEFAULT_HEIGHT = 640;
const MIN_WIDTH = 520;
const MIN_HEIGHT = 280;

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

type ResizeState = {
  direction: ResizeDirection;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  startLeft: number;
  startTop: number;
};

function AttachedPlan({
  isOpen,
  loading,
  plan,
  onClose,
  initialPosition,
  zIndex = 50,
}: AttachedPlanProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isImporting, setIsImporting] = useState(false);
  const [size, setSize] = useState(() => {
    if (typeof window === 'undefined') {
      return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
    }
    const initialWidth = Math.max(MIN_WIDTH, window.innerWidth * 0.4);
    return {
      width: Math.min(initialWidth, window.innerWidth - 16),
      height: Math.max(MIN_HEIGHT, window.innerHeight - 16),
    };
  });
  const [isRendered, setIsRendered] = useState(false);
  const [position, setPosition] = useState(initialPosition ?? { x: -9999, y: -9999 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    const initialWidth = Math.max(MIN_WIDTH, window.innerWidth * 0.4);
    const width = Math.min(initialWidth, window.innerWidth - 16);
    const height = Math.max(MIN_HEIGHT, window.innerHeight - 16);
    
    setSize({ width, height });
    
    // Position at the top right for desktop
    if (!initialPosition) {
      setPosition({
        x: Math.max(8, window.innerWidth - width - 8),
        y: 8,
      });
    }

    setTimeout(() => setIsRendered(true), 10);
  }, [isOpen, initialPosition]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (event: MouseEvent) => {
      setPosition({
        x: Math.min(window.innerWidth - size.width - 8, Math.max(8, event.clientX - dragOffset.x)),
        y: Math.min(window.innerHeight - size.height - 8, Math.max(8, event.clientY - dragOffset.y)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, size.width, size.height]);

  useEffect(() => {
    if (!resizeState || typeof window === 'undefined') return;

    const handleMouseMove = (event: MouseEvent) => {
      const dx = event.clientX - resizeState.startX;
      const dy = event.clientY - resizeState.startY;

      let nextWidth = resizeState.startWidth;
      let nextHeight = resizeState.startHeight;
      let nextLeft = resizeState.startLeft;
      let nextTop = resizeState.startTop;

      if (resizeState.direction.includes('e')) {
        nextWidth = Math.max(MIN_WIDTH, Math.min(window.innerWidth - resizeState.startLeft - 8, resizeState.startWidth + dx));
      }

      if (resizeState.direction.includes('s')) {
        nextHeight = Math.max(MIN_HEIGHT, Math.min(window.innerHeight - resizeState.startTop - 8, resizeState.startHeight + dy));
      }

      if (resizeState.direction.includes('w')) {
        const maxDeltaLeft = resizeState.startWidth - MIN_WIDTH;
        const constrainedDeltaLeft = Math.max(-resizeState.startLeft + 8, Math.min(dx, maxDeltaLeft));
        nextLeft = resizeState.startLeft + constrainedDeltaLeft;
        nextWidth = resizeState.startWidth - constrainedDeltaLeft;
      }

      if (resizeState.direction.includes('n')) {
        const maxDeltaTop = resizeState.startHeight - MIN_HEIGHT;
        const constrainedDeltaTop = Math.max(-resizeState.startTop + 8, Math.min(dy, maxDeltaTop));
        nextTop = resizeState.startTop + constrainedDeltaTop;
        nextHeight = resizeState.startHeight - constrainedDeltaTop;
      }

      setSize({
        width: Math.min(nextWidth, window.innerWidth - nextLeft - 8),
        height: Math.min(nextHeight, window.innerHeight - nextTop - 8),
      });
      setPosition({ x: nextLeft, y: nextTop });
      };

      const handleMouseUp = () => {
        setResizeState(null);
      };

      document.body.style.cursor = `${resizeState.direction}-resize`;
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizeState]);

  const startResize = (direction: ResizeDirection, event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    setIsDragging(false);

    const modal = event.currentTarget.parentElement as HTMLDivElement;
    const rect = modal.getBoundingClientRect();

    setResizeState({
      direction,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      startLeft: rect.left,
      startTop: rect.top,
    });
  };

  const handleImportPlan = async () => {
    if (!plan) return;
    setIsImporting(true);
    try {
      const result = await importAttachedPlan(plan);
      if (result.success) {
        onClose();
        router.push(`/plan`);
      }
    } catch (error) {
      console.error('Error importing plan:', error);
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  if (typeof window !== 'undefined' && window.innerWidth < 1024) {
    return (
      <div className="fixed inset-x-0 top-14 bottom-0 z-50 flex items-center justify-center" style={{ zIndex }} onClick={onClose}>
        <div 
          className="bg-panel-bg rounded-3xl border border-panel-border shadow-xl w-full m-3 h-[calc(100vh-3.5rem-1.5rem)] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-panel-bg border-b border-panel-border px-4 md:px-8 py-4 md:py-6 flex justify-between items-center gap-4 shrink-0">
            <h2 className="text-lg md:text-xl font-bold text-heading">Attached Plan</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleImportPlan}
                disabled={isImporting || loading}
                className="px-3 py-1.5 bg-uva-blue/90 text-white rounded-xl hover:bg-uva-blue text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Add this plan to plan builder"
              >
                {isImporting ? 'Adding...' : 'Add to Plan Builder'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
                aria-label="Close attached plan"
              >
                <Icon name="x" color="currentColor" width={24} height={24} className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="px-4 md:px-8 py-4 md:py-6 overflow-y-auto flex-1">
            {loading && (
              <div className="animate-pulse space-y-3">
                <div className="h-6 w-2/3 rounded bg-input-disabled" />
                <div className="h-4 w-1/3 rounded bg-input-disabled" />
                <div className="h-24 w-full rounded bg-input-disabled" />
              </div>
            )}

            {!loading && plan && (
              <div>
                <h3 className="text-2xl font-bold text-heading break-words whitespace-pre-wrap">{plan.title}</h3>
                <p className="text-sm text-text-secondary mt-1 mb-4">
                  Plan by{' '}
                  <Link href={`/profile/${plan.ownerComputingId}?from=${encodeURIComponent(pathname)}`} className="text-text-primary font-semibold hover:underline">
                    {plan.ownerDisplayName}
                  </Link>
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {plan.semesters.map((sem) => (
                    <div key={sem.id} className="bg-panel-bg-alt border border-panel-border rounded-xl p-4">
                      <div className="flex justify-between items-center border-b border-panel-border pb-2 mb-3">
                        <h4 className="font-bold text-heading">{sem.termName} {sem.year}</h4>
                        <span className="text-xs font-semibold bg-input-disabled px-2 py-1 rounded text-text-secondary">
                          {sem.courses.reduce((acc, c) => acc + (c.creditsMin ?? 0), 0)} cr
                        </span>
                      </div>

                      <div className="space-y-2">
                        {sem.courses.length === 0 && (
                          <p className="text-sm text-text-secondary">No courses in this semester.</p>
                        )}
                        {sem.courses.map((course) => (
                          <div key={course.id} className="px-3 bg-panel-bg border border-panel-border-strong rounded-lg text-sm flex justify-between items-center h-[42px]">
                            <span className="font-medium text-text-primary truncate">{course.courseCode}</span>
                            <span className="text-text-secondary font-semibold">{course.creditsMin ?? 0} cr</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex }}>
      <div
        role="dialog"
        aria-modal="false"
        className={`pointer-events-auto fixed rounded-2xl border border-panel-border bg-panel-bg shadow-2xl overflow-hidden min-w-[360px] md:min-w-[520px] min-h-[280px] max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)] flex flex-col transition-opacity duration-200 ${isDragging ? 'select-none' : ''} ${isRendered ? 'opacity-100' : 'opacity-0'}`}
        style={{
          left: position.x,
          top: position.y,
          width: size.width,
          height: size.height,
        }}
      >
        <div className="absolute top-0 left-2 right-2 h-2 cursor-n-resize z-20" onMouseDown={(event) => startResize('n', event)} />
        <div className="absolute bottom-0 left-2 right-2 h-2 cursor-s-resize z-20" onMouseDown={(event) => startResize('s', event)} />
        <div className="absolute left-0 top-2 bottom-2 w-2 cursor-w-resize z-20" onMouseDown={(event) => startResize('w', event)} />
        <div className="absolute right-0 top-2 bottom-2 w-2 cursor-e-resize z-20" onMouseDown={(event) => startResize('e', event)} />
        <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-20" onMouseDown={(event) => startResize('nw', event)} />
        <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-20" onMouseDown={(event) => startResize('ne', event)} />
        <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize z-20" onMouseDown={(event) => startResize('sw', event)} />
        <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-20" onMouseDown={(event) => startResize('se', event)} />

        <div
          onMouseDown={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest('button')) return;

            const rect = (event.currentTarget.parentElement as HTMLDivElement).getBoundingClientRect();
            setDragOffset({ x: event.clientX - rect.left, y: event.clientY - rect.top });
            setIsDragging(true);
          }}
          className="h-12 px-4 border-b border-panel-border flex items-center justify-between cursor-move bg-panel-bg-alt flex-shrink-0"
        >
          <div className="flex items-center">
            <h3 className="text-base font-bold text-heading">Attached Plan</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleImportPlan}
              disabled={isImporting || loading}
              className="px-3 py-1.5 border border-panel-border bg-input-bg text-text-primary rounded-full hover:border-panel-border-strong text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Add this plan to plan builder"
            >
              {isImporting ? 'Adding...' : 'Add to Plan Builder'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-text-primary cursor-pointer"
              aria-label="Close attached plan"
            >
              <Icon name="x" color="currentColor" width={20} height={20} className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {loading && (
            <div className="animate-pulse space-y-3">
              <div className="h-6 w-2/3 rounded bg-input-disabled" />
              <div className="h-4 w-1/3 rounded bg-input-disabled" />
              <div className="h-24 w-full rounded bg-input-disabled" />
            </div>
          )}

          {!loading && plan && (
            <div>
              <h4 className="text-2xl font-bold text-heading break-words whitespace-pre-wrap">{plan.title}</h4>
              <p className="text-sm text-text-secondary mt-1 mb-4">
                Plan by{' '}
                <Link href={`/profile/${plan.ownerComputingId}?from=${encodeURIComponent(pathname)}`} className="text-text-primary font-semibold hover:underline">
                  {plan.ownerDisplayName}
                </Link>
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {plan.semesters.map((sem) => (
                  <div key={sem.id} className="bg-panel-bg-alt border border-panel-border rounded-xl p-4">
                    <div className="flex justify-between items-center border-b border-panel-border pb-2 mb-3">
                      <h5 className="font-bold text-heading">{sem.termName} {sem.year}</h5>
                      <span className="text-xs font-semibold bg-input-disabled px-2 py-1 rounded text-text-secondary">
                        {sem.courses.reduce((acc, c) => acc + (c.creditsMin ?? 0), 0)} cr
                      </span>
                    </div>

                    <div className="space-y-2">
                      {sem.courses.length === 0 && (
                        <p className="text-sm text-text-secondary">No courses in this semester.</p>
                      )}
                      {sem.courses.map((course) => (
                        <div
                          key={course.id}
                          className="px-3 py-2 bg-panel-bg border border-panel-border-strong rounded-lg text-sm flex justify-between items-stretch hover:border-panel-border transition-colors"
                        >
                          <div className="flex flex-col justify-center flex-1 min-w-0">
                            <span className="font-medium text-text-primary truncate">{course.courseCode}</span>
                            {course.title && (
                              <p className="text-xs text-text-muted truncate mt-0.5 min-w-0">{course.title}</p>
                            )}
                          </div>
                          <div className="flex items-center justify-end min-w-fit pl-2">
                            <span className="text-text-secondary font-semibold whitespace-nowrap">
                              {course.creditsMin ?? 0} cr
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
