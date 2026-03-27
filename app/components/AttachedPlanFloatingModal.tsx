"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { importAttachedPlan } from '../actions';

export type AttachedPlanView = {
  id: string;
  title: string;
  ownerDisplayName: string;
  semesters: Array<{
    id: string;
    termName: string;
    termOrder: number;
    year: number;
    courses: Array<{
      id: string;
      courseCode: string;
      creditsMin: number | null;
      creditsMax: number | null;
    }>;
  }>;
};

type AttachedPlanFloatingModalProps = {
  isOpen: boolean;
  loading: boolean;
  plan: AttachedPlanView | null;
  onClose: () => void;
  initialPosition?: { x: number; y: number };
  zIndex?: number;
};

const DEFAULT_WIDTH = 900;
const DEFAULT_HEIGHT = 640;
const MIN_WIDTH = 360;
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

export default function AttachedPlanFloatingModal({
  isOpen,
  loading,
  plan,
  onClose,
  initialPosition,
  zIndex = 50,
}: AttachedPlanFloatingModalProps) {
  const router = useRouter();
  const [size, setSize] = useState(() => {
    if (typeof window === 'undefined') {
      return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
    }
    return {
      width: Math.min(DEFAULT_WIDTH, window.innerWidth - 32),
      height: Math.min(DEFAULT_HEIGHT, window.innerHeight - 32),
    };
  });
  const [position, setPosition] = useState(initialPosition ?? { x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined' || initialPosition) return;

    const width = Math.min(DEFAULT_WIDTH, window.innerWidth - 32);
    const height = Math.min(DEFAULT_HEIGHT, window.innerHeight - 32);
    const padding = 24;
    
    setSize({ width, height });
    // Position in bottom right
    setPosition({
      x: window.innerWidth - width - padding,
      y: window.innerHeight - height - padding,
    });
  }, [isOpen, initialPosition]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (event: MouseEvent) => {
      setPosition({
        x: Math.max(8, event.clientX - dragOffset.x),
        y: Math.max(8, event.clientY - dragOffset.y),
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
  }, [isDragging, dragOffset]);

  useEffect(() => {
    if (!resizeState || typeof window === 'undefined') return;

    const handleMouseMove = (event: MouseEvent) => {
      const dx = event.clientX - resizeState.startX;
      const dy = event.clientY - resizeState.startY;
      const maxWidth = window.innerWidth - 16;
      const maxHeight = window.innerHeight - 16;

      let nextWidth = resizeState.startWidth;
      let nextHeight = resizeState.startHeight;
      let nextLeft = resizeState.startLeft;
      let nextTop = resizeState.startTop;

      if (resizeState.direction.includes('e')) {
        nextWidth = Math.max(MIN_WIDTH, Math.min(maxWidth, resizeState.startWidth + dx));
      }

      if (resizeState.direction.includes('s')) {
        nextHeight = Math.max(MIN_HEIGHT, Math.min(maxHeight, resizeState.startHeight + dy));
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
        width: Math.min(nextWidth, maxWidth),
        height: Math.min(nextHeight, maxHeight),
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
    event.preventDefault();
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
        // Navigate to plan builder with the newly imported plan
        router.push(`/plan`);
      }
    } catch (error) {
      console.error('Error importing plan:', error);
    } finally {
      setIsImporting(false);
    }
  };
const handleCompareInPlanBuilder = () => {
    if (!plan) return;
    // Store the plan data in sessionStorage temporarily
    sessionStorage.setItem('comparisonPlan', JSON.stringify(plan));
    onClose();
    // Navigate to plan builder
    router.push('/plan?compare=true');
  };

  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex }}>
      <div
        role="dialog"
        aria-modal="false"
        className={`pointer-events-auto fixed rounded-2xl border border-panel-border bg-panel-bg shadow-2xl overflow-hidden min-w-[360px] min-h-[280px] max-w-[95vw] max-h-[90vh] flex flex-col ${isDragging ? 'select-none' : ''}`}
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
          className="h-12 px-4 border-b border-panel-border flex items-center justify-between cursor-move bg-panel-bg-alt"
        >
          <div className="flex items-center">
            <h3 className="text-base font-bold text-heading">Attached Plan</h3>
            <div className="group relative flex-shrink-0">
              <button
                type="button"
                className="w-5 h-5 text-text-tertiary hover:text-text-secondary transition-colors cursor-help"
                aria-label="Information about the attached plan modal"
              >
                <Icon 
                  name="info"
                  color="currentColor"
                  width={16}
                  height={16}
                />
              </button>
              <div className="absolute left-0 top-full w-56 p-2 bg-panel-bg border border-panel-border rounded-lg text-xs text-text-secondary shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                Use this modal in the Plan Builder to view and compare attached plans side-by-side with your own.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCompareInPlanBuilder}
              disabled={loading}
              className="px-3 py-1.5 border border-panel-border bg-input-bg text-text-primary rounded-xl hover:border-panel-border-strong text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Compare this plan side-by-side in plan builder"
            >
              Compare
            </button>
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
              <h4 className="text-2xl font-bold text-heading">{plan.title}</h4>
              <p className="text-sm text-text-secondary mt-1 mb-4">
                Plan by <span className="text-uva-blue font-semibold">{plan.ownerDisplayName}</span>
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
                        <div key={course.id} className="px-3 bg-panel-bg border border-panel-border-strong rounded-lg text-sm flex justify-between items-center h-[42px]">
                          <span className="font-medium text-text-primary">{course.courseCode}</span>
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