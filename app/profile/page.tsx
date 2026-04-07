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
      <div className="bg-panel-bg p-4 md:p-8 rounded-2xl border border-panel-border mb-8 flex flex-col md:flex-row md:justify-between items-stretch md:items-start gap-6">
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
        <div className="bg-panel-bg p-6 rounded-xl border border-panel-border">
          <h2 className="text-xl font-bold mb-5 text-heading">Activity Stats</h2>
          <div className="space-y-4">
            <div className="flex justify-between border-b pb-3 border-panel-border">
              <span className="text-text-secondary font-medium">Plans Created</span>
              <span className="font-bold text-text-primary">{planCount}</span>
            </div>
            <div className="flex justify-between border-b pb-3 border-panel-border">
              <span className="text-text-secondary font-medium">Plans Published</span>
              <span className="font-bold text-text-primary">0</span>
            </div>
            <div className="flex justify-between border-b pb-3 border-panel-border">
              <span className="text-text-secondary font-medium">Forum Posts</span>
              <span className="font-bold text-text-primary">{postCount}</span>
            </div>
          </div>
        </div>

        <PrivacySettings currentProfileVisibility={user.profileVisibility} />

        <div className="bg-panel-bg p-6 rounded-xl border border-panel-border">
           <h2 className="text-xl font-bold mb-5 text-heading">Badges</h2>
          <div className="flex gap-3 flex-wrap">
            <div className="bg-badge-orange-bg text-uva-orange px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-bold border border-uva-orange/30">
              <Icon name="star" color="currentColor" width={16} height={16} className="w-4 h-4" /> Early Adopter                                                                  
            </div>
            <div className="bg-badge-blue-bg text-badge-blue-text px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-bold border border-uva-blue/20">
              <Icon name="activity" color="currentColor" width={16} height={16} className="w-4 h-4" /> Active Participant
            </div>
            <div className="bg-panel-bg-alt text-gray-500 px-3 py-2 rounded-lg text-sm border border-panel-border-strong border-dashed flex items-center gap-2 font-semibold cursor-pointer hover:border-uva-orange hover:text-uva-orange transition-colors">
              <Icon name="plus" color="currentColor" width={16} height={16} className="w-4 h-4" /> Earn more badges                     
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
