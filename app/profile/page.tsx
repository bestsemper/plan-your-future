import { getCurrentUser } from '../actions';
import { redirect } from 'next/navigation';
import ThemeToggle from './ThemeToggle';
import EditProfileForm from './EditProfileForm';
import EditCompletedCourses from './EditCompletedCourses';
import PrivacySettings from './PrivacySettings';
import prisma from '@/lib/prisma';
import { Icon } from '../components/Icon';

export default async function Profile() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  // Also pre-fetch some minimal stats like plan count, post count
  const planCount = await prisma.plan.count({ where: { userId: user.id } });
  const postCount = await prisma.forumPost.count({ where: { authorId: user.id } });
  const profileSummary = [
    user.major || 'Undeclared',
    user.currentAcademicYear ? `Year ${user.currentAcademicYear}` : null,
    user.gradYear ? `Class of ${user.gradYear}` : null,
  ].filter(Boolean).join(' • ');

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-panel-bg p-4 md:p-8 rounded-3xl border border-panel-border mb-8 flex flex-col md:flex-row md:justify-between items-stretch md:items-start gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-4 md:gap-6 mb-6 text-center sm:text-left">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-uva-orange flex items-center justify-center text-white text-2xl md:text-3xl font-bold uppercase shrink-0">
              {user.displayName.charAt(0)}
            </div>
            <div className="min-w-0 w-full">
              <h1 className="text-2xl md:text-3xl font-bold mb-1 text-heading break-words">Hi, {user.displayName}</h1>
              <p className="text-text-secondary text-base md:text-lg font-medium break-words">
                {profileSummary}
              </p>
              {(user.additionalPrograms ?? []).length > 0 && (
                <p className="text-text-secondary text-sm md:text-base mt-2 break-words">Programs: {(user.additionalPrograms ?? []).join(', ')}</p>
              )}
              {user.bio && <p className="text-text-secondary text-sm md:text-base mt-2 break-words">{user.bio}</p>}
            </div>
          </div>

          <div className="w-full">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-start w-full">
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
        </div>
        
        <ThemeToggle />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-xl font-bold text-heading mb-4">Activity Stats</h2>
          <div className="space-y-3">
            <div className="bg-panel-bg rounded-3xl border border-panel-border flex justify-between items-center px-5 py-4">
              <span className="text-sm font-semibold text-text-primary">Plans Created</span>
              <span className="text-sm font-bold text-text-primary">{planCount}</span>
            </div>
            <div className="bg-panel-bg rounded-3xl border border-panel-border flex justify-between items-center px-5 py-4">
              <span className="text-sm font-semibold text-text-primary">Plans Published</span>
              <span className="text-sm font-bold text-text-primary">0</span>
            </div>
            <div className="bg-panel-bg rounded-3xl border border-panel-border flex justify-between items-center px-5 py-4">
              <span className="text-sm font-semibold text-text-primary">Forum Posts</span>
              <span className="text-sm font-bold text-text-primary">{postCount}</span>
            </div>
          </div>
        </div>

        <PrivacySettings currentProfileVisibility={user.profileVisibility} />
      </div>
    </div>
  );
}
