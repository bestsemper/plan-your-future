import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAttachedPlanViewData } from '../../actions';

type PageParams = {
  planId: string;
};

export default async function AttachedPlanPage({ params }: { params: Promise<PageParams> }) {
  const { planId } = await params;
  const result = await getAttachedPlanViewData(planId);

  if ('error' in result) {
    notFound();
  }

  const { plan } = result;

  return (
    <div className="max-w-5xl mx-auto py-8">
      <Link
        href="/forum"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-uva-blue hover:text-uva-orange transition-colors mb-6"
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
        <span>Back to Forum</span>
      </Link>

      <article className="bg-panel-bg border border-panel-border rounded-md p-5 mb-5">
        <h1 className="text-3xl font-bold text-heading leading-tight">{plan.title}</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Plan by <span className="text-uva-blue font-semibold">{plan.ownerDisplayName}</span>
        </p>
      </article>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plan.semesters.map((sem) => (
          <div key={sem.id} className="bg-panel-bg border border-panel-border rounded-lg p-5 min-h-[150px]">
            <div className="flex justify-between items-center border-b border-panel-border pb-2 mb-3">
              <h3 className="font-bold text-lg text-heading">
                {sem.termName} {sem.year}
              </h3>
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
                  className="px-3 bg-panel-bg-alt border border-panel-border-strong rounded-md text-sm flex justify-between items-center h-[46px]"
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
