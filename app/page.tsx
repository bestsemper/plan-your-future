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
    <div className="max-w-5xl mx-auto py-8">
      {user ? (
        <h1 className="text-3xl font-bold mb-2 text-heading">Welcome, {user.displayName}</h1>
      ) : (
        <h1 className="text-3xl font-bold mb-2 text-heading">Welcome to Plan Your Future</h1>
      )}
      <p className="text-text-secondary mb-10">
        Your companion for 4-year course planning at UVA.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-panel-bg p-6 rounded-lg border border-panel-border flex flex-col justify-between">
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
          <Link href={user ? "/plan" : "/login"} className="inline-block bg-uva-blue text-white px-5 py-2.5 rounded font-medium hover:bg-uva-blue-dark transition-colors w-fit">
            {user ? (plans.length > 0 ? 'View Your Plans' : 'Build Your Plan') : 'Sign In to Build'}
          </Link>
        </div>

        <div className="bg-panel-bg p-6 rounded-lg border border-panel-border flex flex-col justify-between">
          <div>
            <h2 className="text-2xl font-semibold mb-3 text-heading">Recent Forum Activity</h2>
            <p className="text-text-secondary mb-6">
              See what other students are planning and get feedback on your schedule.
            </p>
          </div>
          <Link href="/forum" className="inline-flex items-center gap-1.5 text-sm font-semibold text-uva-blue hover:text-uva-orange transition-colors">
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
