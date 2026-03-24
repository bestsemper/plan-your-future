"use client";

import { createContext, useContext, useMemo, useState } from 'react';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import AttachedPlanFloatingModal, { type AttachedPlanView } from '../components/AttachedPlanFloatingModal';
import { getAttachedPlanViewData } from '../actions';

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
          <AttachedPlanFloatingModal
            key={modal.id}
            isOpen
            loading={modal.loading}
            plan={modal.plan}
            initialPosition={{ x: 96 + (index % 8) * 28, y: 72 + (index % 8) * 20 }}
            zIndex={50 + index}
            onClose={() => {
              setPlanModals((prev) => prev.filter((item) => item.id !== modal.id));
            }}
          />
        ))}
    </AttachedPlanModalContext.Provider>
  );
}
