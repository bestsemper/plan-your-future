"use client";

import { useEffect, useState } from 'react';

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

export default function AttachedPlanFloatingModal({
  isOpen,
  loading,
  plan,
  onClose,
  initialPosition,
  zIndex = 50,
}: AttachedPlanFloatingModalProps) {
  const [position, setPosition] = useState(initialPosition ?? { x: 120, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined' || initialPosition) return;

    const width = Math.min(DEFAULT_WIDTH, window.innerWidth - 32);
    const height = Math.min(DEFAULT_HEIGHT, window.innerHeight - 32);
    setPosition({
      x: Math.max(16, Math.round((window.innerWidth - width) / 2)),
      y: Math.max(16, Math.round((window.innerHeight - height) / 2)),
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex }}>
      <div
        role="dialog"
        aria-modal="false"
        className={`pointer-events-auto fixed rounded-2xl border border-panel-border bg-panel-bg shadow-2xl overflow-hidden resize both min-w-[360px] min-h-[280px] max-w-[95vw] max-h-[90vh] flex flex-col ${isDragging ? 'select-none' : ''}`}
        style={{
          left: position.x,
          top: position.y,
          width: `min(${DEFAULT_WIDTH}px, calc(100vw - 32px))`,
          height: `min(${DEFAULT_HEIGHT}px, calc(100vh - 32px))`,
        }}
      >
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
          <h3 className="text-base font-bold text-heading">Attached Plan</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary cursor-pointer"
            aria-label="Close attached plan"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
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