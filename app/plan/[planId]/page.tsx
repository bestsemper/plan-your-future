"use client";

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getAttachedPlanViewData, importAttachedPlan } from '../../actions';
import { Icon } from '../../components/Icon';

type PageParams = {
  planId: string;
};

type AttachedPlanViewData = Awaited<ReturnType<typeof getAttachedPlanViewData>>;

export default function AttachedPlanPage({ params }: { params: Promise<PageParams> }) {
  const router = useRouter();
  const [planId, setPlanId] = useState<string | null>(null);
  const [planData, setPlanData] = useState<AttachedPlanViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { planId: id } = await params;
      setPlanId(id);
      const result = await getAttachedPlanViewData(id);
      if ('error' in result) {
        setError('Plan not found');
      } else {
        setPlanData(result);
      }
      setLoading(false);
    })();
  }, [params]);

  const handleImportPlan = async () => {
    if (!planData || 'error' in planData) return;
    setIsImporting(true);
    try {
      const result = await importAttachedPlan(planData.plan);
      if (result.success) {
        router.push(`/plan`);
      }
    } catch (error) {
      console.error('Error importing plan:', error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleCompareInPlanBuilder = () => {
    if (!planData || 'error' in planData) return;
    // Store the plan data in sessionStorage temporarily
    sessionStorage.setItem('comparisonPlan', JSON.stringify(planData.plan));
    // Navigate to plan builder
    router.push('/plan?compare=true');
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-8">
        <div className="animate-pulse space-y-3">
          <div className="h-6 w-32 rounded bg-input-disabled" />
          <div className="h-10 w-64 rounded bg-input-disabled" />
          <div className="h-24 w-full rounded bg-input-disabled" />
        </div>
      </div>
    );
  }

  if (error || !planData || 'error' in planData) {
    return (
      <div className="max-w-5xl mx-auto py-8">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-uva-blue hover:text-uva-orange transition-colors cursor-pointer mb-6"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Go Back</span>
        </button>
        <div className="bg-red-500/10 border border-red-500/40 text-red-600 px-4 py-3 rounded-lg">
          {error || 'Plan not found'}
        </div>
      </div>
    );
  }

  const { plan } = planData;

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-uva-blue hover:text-uva-orange transition-colors cursor-pointer"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Go Back</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCompareInPlanBuilder}
            disabled={loading}
            className="px-4 py-2 border border-panel-border bg-input-bg text-text-primary rounded-xl hover:border-panel-border-strong text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Compare this plan side-by-side in plan builder"
          >
            Compare
          </button>
          <button
            onClick={handleImportPlan}
            disabled={isImporting || loading}
            className="px-4 py-2 bg-uva-blue/90 text-white rounded-xl hover:bg-uva-blue text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Add this plan to plan builder"
          >
            {isImporting ? 'Adding...' : 'Add to Plan Builder'}
          </button>
        </div>
      </div>

      <article className="bg-panel-bg border border-panel-border rounded-2xl p-5 mb-5">
        <h1 className="text-3xl font-bold text-heading leading-tight">{plan.title}</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Plan by <span className="text-uva-blue font-semibold">{plan.ownerDisplayName}</span>
        </p>
      </article>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plan.semesters.map((sem) => (
          <div key={sem.id} className="bg-panel-bg border border-panel-border rounded-2xl p-5 min-h-[150px]">
            <div className="flex justify-between items-center border-b border-panel-border pb-2 mb-3">
              <h3 className="font-bold text-lg text-heading">
                {sem.termName} {sem.year}
              </h3>
              <span className="text-xs font-semibold bg-input-disabled px-2 py-1 rounded-lg text-text-secondary">
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
                  className="px-3 bg-panel-bg-alt border border-panel-border-strong rounded-xl text-sm flex justify-between items-center h-[46px]"
                >
                  <span className="font-medium text-text-primary">{course.courseCode}</span>
                  <span className="text-gray-500 font-semibold">{course.creditsMin ?? 0} cr</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
