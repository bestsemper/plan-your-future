import Link from 'next/link';
import { getCurrentUser } from './actions';
import prisma from '@/lib/prisma';
import { Icon } from './components/Icon';

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month ago';
  return `${months} months ago`;
}

export default async function Home() {
  const user = await getCurrentUser();

  const [plans, postCount, creditAgg] = user
    ? await Promise.all([
        prisma.plan.findMany({
          where: { userId: user.id },
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.forumPost.count({ where: { authorId: user.id } }),
        prisma.plannedCourse.aggregate({
          _sum: { creditsMin: true },
          where: { semester: { plan: { userId: user.id } } },
        }),
      ])
    : [[], 0, { _sum: { creditsMin: 0 } }];

  const mostRecentPlan = plans[0] ?? null;
  const totalCredits = creditAgg._sum.creditsMin ?? 0;
  const firstName = user?.displayName.split(' ')[0] ?? '';

  const today = new Date();
  const dateLabel = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const metaParts: string[] = [];
  if (user?.major) metaParts.push(user.major);
  if (user?.gradYear) metaParts.push(`Class of ${user.gradYear}`);
  const metaLine = metaParts.join(' · ');

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Hero */}
      <div className="rounded-3xl bg-uva-blue px-9 py-8">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45 mb-2.5">
          {dateLabel}
        </div>
          <h1 className="text-3xl font-bold text-white leading-tight mb-1.5">
            {user ? `Welcome back, ${firstName}.` : "Welcome to Hoos' Plan."}
          </h1>
          <p className="text-sm font-medium text-white/55 mb-6">
            {user
              ? metaLine || 'Plan your UVA journey.'
              : 'Build your 4-year plan and explore courses.'}
          </p>

          {user ? (
            <div className="flex gap-6">
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-bold text-white leading-none">{plans.length}</span>
                <span className="text-xs font-medium uppercase tracking-[0.08em] text-white/45">Plans</span>
              </div>
              <div className="w-px bg-white/15 self-stretch" />
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-bold text-white leading-none">{postCount}</span>
                <span className="text-xs font-medium uppercase tracking-[0.08em] text-white/45">Posts</span>
              </div>
              <div className="w-px bg-white/15 self-stretch" />
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-bold text-white leading-none">{totalCredits}</span>
                <span className="text-xs font-medium uppercase tracking-[0.08em] text-white/45">Credits logged</span>
              </div>
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-white text-uva-blue text-sm font-bold hover:bg-gray-100 transition-colors"
            >
              Sign in
              <Icon name="arrow-right" color="currentColor" width={14} height={14} />
            </Link>
          )}
      </div>

      {/* Primary plan CTA */}
      <Link
        href={user ? '/plan' : '/login'}
        className="group flex items-center justify-between gap-5 rounded-3xl bg-uva-orange px-7 py-6 transition-[filter] hover:brightness-110"
      >
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-white mb-0.5 truncate">
            {user
              ? mostRecentPlan
                ? mostRecentPlan.title
                : 'Start your first plan'
              : 'Sign in to build your plan'}
          </h3>
          <p className="text-sm text-white/75">
            {user && mostRecentPlan
              ? `Last edited ${formatRelative(mostRecentPlan.updatedAt)}  ·  ${plans.length} plan${plans.length === 1 ? '' : 's'} total`
              : user
                ? 'Map out your 4-year journey at UVA.'
                : 'Create an account to save plans and post on the forum.'}
          </p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-white transition-colors group-hover:bg-white/30">
          <Icon name="arrow-right" color="currentColor" width={18} height={18} />
        </div>
      </Link>

      {/* Feature grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Link
          href="/forum"
          className="group flex flex-col gap-2.5 rounded-3xl border border-panel-border bg-panel-bg p-6 transition-colors hover:border-panel-border-strong"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-panel-bg-alt text-uva-blue">
            <Icon name="forum" color="currentColor" width={18} height={18} />
          </div>
          <h3 className="text-base font-bold text-heading">Forum</h3>
          <p className="text-sm text-text-muted leading-relaxed flex-1">
            See what other students are planning and get feedback on your schedule.
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-uva-orange mt-1">
            Browse posts
            <Icon name="arrow-right" color="currentColor" width={12} height={12} />
          </span>
        </Link>

        <Link
          href="/courses"
          className="group flex flex-col gap-2.5 rounded-3xl border border-panel-border bg-panel-bg p-6 transition-colors hover:border-panel-border-strong"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-panel-bg-alt text-uva-blue">
            <Icon name="search" color="currentColor" width={18} height={18} />
          </div>
          <h3 className="text-base font-bold text-heading">Course Search</h3>
          <p className="text-sm text-text-muted leading-relaxed flex-1">
            Browse all UVA courses, filter by department, and find what fits your degree.
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-uva-orange mt-1">
            Search courses
            <Icon name="arrow-right" color="currentColor" width={12} height={12} />
          </span>
        </Link>

        <Link
          href="/prerequisites"
          className="group flex flex-col gap-2.5 rounded-3xl border border-panel-border bg-panel-bg p-6 transition-colors hover:border-panel-border-strong"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-panel-bg-alt text-uva-blue">
            <Icon name="prerequisites" color="currentColor" width={18} height={18} />
          </div>
          <h3 className="text-base font-bold text-heading">Prerequisites</h3>
          <p className="text-sm text-text-muted leading-relaxed flex-1">
            Visualize prerequisite chains and make sure you&apos;re on track before registering.
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-uva-orange mt-1">
            Explore graph
            <Icon name="arrow-right" color="currentColor" width={12} height={12} />
          </span>
        </Link>
      </div>
    </div>
  );
}
