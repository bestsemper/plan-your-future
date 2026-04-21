import Link from 'next/link';
import { getCurrentUser } from './actions';
import prisma from '@/lib/prisma';

export default async function Home() {
  const user = await getCurrentUser();
  const plans = user ? await prisma.plan.findMany({
    where: { userId: user.id }
  }) : [];

  return (
    <div className="w-full pt-0 flex flex-col gap-8 h-full">

      {/* Welcome */}
      <div className="border-b border-panel-border pb-6">
        <h1 className="text-3xl font-bold text-heading">
          {user ? `Welcome back, ${user.displayName.split(' ')[0]}.` : 'Welcome to Hoos\u2019 Plan.'}
        </h1>
      </div>

      {/* Feature cards */}
      <div>
        <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-widest mb-3">Get Started</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-panel-bg p-6 rounded-3xl border border-panel-border flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-semibold mb-2 text-heading">Your Plans</h3>
              <p className="text-text-secondary text-sm mb-5">
                {!user
                  ? 'Log in to create and manage your academic plans.'
                  : plans.length > 0
                    ? `You have ${plans.length} plan${plans.length > 1 ? 's' : ''} saved. Keep your academic journey on track!`
                    : "You haven't built a plan yet. Start mapping out your degree."}
              </p>
            </div>
            <Link href={user ? '/plan' : '/login'} className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary hover:text-uva-orange transition-colors w-fit">
              {user ? (plans.length > 0 ? 'View Your Plans' : 'Build Your Plan') : 'Sign In to Build'}
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </Link>
          </div>

          <div className="bg-panel-bg p-6 rounded-3xl border border-panel-border flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-semibold mb-2 text-heading">Forum</h3>
              <p className="text-text-secondary text-sm mb-5">
                See what other students are planning and get feedback on your schedule.
              </p>
            </div>
            <Link href="/forum" className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary hover:text-uva-orange transition-colors w-fit">
              Browse the Forum
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </Link>
          </div>

          <div className="bg-panel-bg p-6 rounded-3xl border border-panel-border flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-semibold mb-2 text-heading">Course Search</h3>
              <p className="text-text-secondary text-sm mb-5">
                Browse all UVA courses, filter by department, and find what fits your degree.
              </p>
            </div>
            <Link href="/courses" className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary hover:text-uva-orange transition-colors w-fit">
              Search Courses
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </Link>
          </div>

          <div className="bg-panel-bg p-6 rounded-3xl border border-panel-border flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-semibold mb-2 text-heading">Prerequisites</h3>
              <p className="text-text-secondary text-sm mb-5">
                Visualize prerequisite chains and make sure you&apos;re on track before registering.
              </p>
            </div>
            <Link href="/prerequisites" className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary hover:text-uva-orange transition-colors w-fit">
              Explore Prerequisites
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </Link>
          </div>
        </div>
      </div>

      {/* About + Contact strip */}
      <div className="mt-auto border-t border-panel-border pt-6 pb-6 md:pb-0 flex flex-col sm:flex-row gap-6 sm:gap-12">
        <div className="flex-1">
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-widest mb-1.5">About</p>
          <p className="text-text-secondary text-sm leading-relaxed">
            Hoos' Plan is a free tool made by UVA students to help fellow Hoos map out their degree path, discover courses, and plan smarter.
          </p>
        </div>
        <div className="shrink-0 lg:pr-20">
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-widest mb-1.5">Contact</p>
          <Link href="mailto:contact@hoosplan.com" className="text-sm font-semibold text-text-primary hover:text-uva-orange transition-colors">
            contact@hoosplan.com
          </Link>
        </div>
      </div>

    </div>
  );
}
