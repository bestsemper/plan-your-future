import { getCurrentUser, logout } from '../actions';
import { redirect } from 'next/navigation';
import ThemeToggle from './ThemeToggle';
import EditProfileForm from './EditProfileForm';
import EditCompletedCourses from './EditCompletedCourses';
import PrivacySettings from './PrivacySettings';
import DeleteAccountButton from './DeleteAccountButton';
import prisma from '@/lib/prisma';
import { Icon } from '../components/Icon';

export default async function Profile() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const planCount = await prisma.plan.count({ where: { userId: user.id } });
  const postCount = await prisma.forumPost.count({ where: { authorId: user.id } });

  const profileSummaryItems = [
    user.major || 'Undeclared',
    user.currentAcademicYear ? `Year ${user.currentAcademicYear}` : null,
    user.gradYear ? `Class of ${user.gradYear}` : null,
  ].filter(Boolean);

  return (
    <div className="w-full">

      {/* Profile hero */}
      <div className="bg-panel-bg border border-panel-border rounded-3xl px-7 py-6 flex flex-col md:flex-row md:items-start gap-6 mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-heading mb-1">{user.displayName}</h1>
          <div className="flex items-center gap-2 mb-4">
            {profileSummaryItems.map((item, i) => (
              <div key={`summary-${i}`} className="flex items-center gap-2">
                {i > 0 && (
                  <svg className="w-1 h-1" viewBox="0 0 4 4" fill="currentColor">
                    <circle cx="2" cy="2" r="2" className="text-text-secondary" />
                  </svg>
                )}
                <span className="text-base text-text-secondary font-medium">{item}</span>
              </div>
            ))}
          </div>
          {user.bio && <p className="text-base text-text-secondary mb-4">{user.bio}</p>}
          <div className="flex flex-wrap gap-2">
            <EditProfileForm
              displayName={user.displayName}
              major={user.major}
              additionalPrograms={user.additionalPrograms}
              currentAcademicYear={user.currentAcademicYear}
              gradYear={user.gradYear}
              bio={user.bio}
            />
            <EditCompletedCourses />
          </div>
        </div>
        <ThemeToggle />
      </div>

      {/* Stats + Privacy grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">

        {/* Activity */}
        <div>
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-widest mb-3">Activity</p>
          <div className="bg-panel-bg border border-panel-border rounded-3xl overflow-hidden">
            {[
              { label: 'Plans Created', value: planCount },
              { label: 'Plans Published', value: 0 },
              { label: 'Forum Posts', value: postCount },
            ].map((stat, i, arr) => (
              <div key={stat.label} className={`flex items-center justify-between px-5 py-3.5 ${i < arr.length - 1 ? 'border-b border-panel-border' : ''}`}>
                <span className="text-sm font-semibold text-text-primary">{stat.label}</span>
                <span className="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-hover-bg text-sm font-bold text-text-primary">
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Privacy */}
        <PrivacySettings currentProfileVisibility={user.profileVisibility} currentAnonymousMode={user.anonymousMode} />
      </div>

      {/* Account */}
      <div>
        <p className="text-xs font-semibold text-text-tertiary uppercase tracking-widest mb-3">Account</p>
        <div className="bg-panel-bg border border-panel-border rounded-3xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-panel-border">
            <div>
              <p className="text-sm font-semibold text-text-primary">Email</p>
              <p className="text-xs text-text-tertiary mt-0.5">{user.computingId}@virginia.edu</p>
            </div>
          </div>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-panel-border">
            <p className="text-sm font-semibold text-text-primary">Log Out</p>
            <form action={logout}>
              <button type="submit" className="flex items-center gap-1.5 text-sm font-semibold text-text-primary hover:text-text-secondary transition-colors cursor-pointer">
                <Icon name="logout" color="currentColor" width={15} height={15} />
                Log Out
              </button>
            </form>
          </div>
          <div className="flex items-center justify-between px-5 py-3.5">
            <div>
              <p className="text-sm font-semibold text-text-primary">Delete Account</p>
              <p className="text-xs text-text-tertiary mt-0.5">Permanently delete your account and data.</p>
            </div>
            <DeleteAccountButton />
          </div>
        </div>
      </div>

    </div>
  );
}
