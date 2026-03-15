import { getCurrentUser } from '../actions';
import { redirect } from 'next/navigation';
import ThemeToggle from './ThemeToggle';
import ProfileActions from './ProfileActions';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function Profile() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  // Also pre-fetch some minimal stats like plan count, post count
  const planCount = await prisma.plan.count({ where: { userId: user.id } });
  const postCount = await prisma.forumPost.count({ where: { authorId: user.id } });

  return (
    <div className="max-w-5xl mx-auto py-4 md:py-8">
      <div className="bg-panel-bg p-4 md:p-8 rounded-2xl border border-panel-border mb-8 flex flex-col md:flex-row md:justify-between items-stretch md:items-start gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-4 md:gap-6 mb-6 text-center sm:text-left">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-uva-orange flex items-center justify-center text-white text-2xl md:text-3xl font-bold uppercase shrink-0">
              {user.displayName.charAt(0)}
            </div>
            <div className="min-w-0 w-full">
              <h1 className="text-2xl md:text-3xl font-bold mb-1 text-heading break-words">Hi, {user.displayName}</h1>
              <p className="text-text-secondary text-base md:text-lg font-medium break-words">{user.major || 'Undeclared'} • Class of {user.gradYear || '2026'}</p>
              {user.bio && <p className="text-text-secondary text-sm md:text-base mt-2 break-words">{user.bio}</p>}
            </div>
          </div>

          <div className="w-full">
            <ProfileActions
              displayName={user.displayName}
              major={user.major}
              gradYear={user.gradYear}
              bio={user.bio}
            />
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

        <div className="bg-panel-bg p-6 rounded-xl border border-panel-border">
           <h2 className="text-xl font-bold mb-5 text-heading">Badges</h2>
          <div className="flex gap-3 flex-wrap">
            <div className="bg-badge-orange-bg text-uva-orange px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-bold border border-uva-orange/30">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Early Adopter                                                                  
            </div>
            <div className="bg-badge-blue-bg text-badge-blue-text px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-bold border border-uva-blue/20">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M8 12h8"/><path d="M12 8v8"/></svg> Active Participant
            </div>
            <div className="bg-panel-bg-alt text-gray-500 px-3 py-2 rounded-lg text-sm border border-panel-border-strong border-dashed flex items-center gap-2 font-semibold cursor-pointer hover:border-uva-orange hover:text-uva-orange transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Earn more badges                     
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
