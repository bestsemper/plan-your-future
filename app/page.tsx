import Link from 'next/link';
import { getCurrentUser } from './actions';
import { redirect } from 'next/navigation';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function Home() {
  const user = await getCurrentUser();
  const plans = user ? await prisma.plan.findMany({
    where: { userId: user.id }
  }) : [];

  return (
    <div className="w-full pt-0 pb-6">
      <div className="mb-6 border-b border-panel-border pb-4 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-heading">Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-panel-bg p-6 rounded-xl border border-panel-border flex flex-col justify-between">
          <div>
            <h2 className="text-2xl font-semibold mb-3 text-heading">Your Plans</h2>
            {!user ? (
              <p className="text-text-secondary mb-6">
                Log in to create and manage your 4-year academic plans securely.
              </p>
            ) : plans.length > 0 ? (
              <p className="text-text-secondary mb-6">
                You have {plans.length} plan{plans.length > 1 ? 's' : ''} saved. Keep your academic journey on track!
              </p>
            ) : (
              <p className="text-text-secondary mb-6">
                You haven't generated a plan yet. Keep your academic journey on track!
              </p>
            )}
          </div>
          <Link href={user ? "/plan" : "/login"} className="inline-flex items-center gap-1.5 text-sm font-semibold text-badge-blue-text hover:text-uva-orange transition-colors w-fit">
            {user ? (plans.length > 0 ? 'View Your Plans' : 'Build Your Plan') : 'Sign In to Build'}
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
              <path d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        </div>

        <div className="bg-panel-bg p-6 rounded-xl border border-panel-border flex flex-col justify-between">
          <div>
            <h2 className="text-2xl font-semibold mb-3 text-heading">Recent Forum Activity</h2>
            <p className="text-text-secondary mb-6">
              See what other students are planning and get feedback on your schedule.
            </p>
          </div>
          <Link href="/forum" className="inline-flex items-center gap-1.5 text-sm font-semibold text-badge-blue-text hover:text-uva-orange transition-colors">
            Browse the Forum
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
              <path d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  )
}
