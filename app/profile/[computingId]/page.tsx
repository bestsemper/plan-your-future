import { getUserProfile } from '../../actions';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function UserProfilePage({ params }: { params: Promise<{ computingId: string }> }) {
  const { computingId } = await params;
  const profileData = await getUserProfile(computingId);

  if ('error' in profileData) {
    redirect('/forum');
  }

  const { user, postCount } = profileData;

  return (
    <div className="max-w-5xl mx-auto py-4 md:py-8">
      <Link href="/forum" className="inline-flex items-center gap-1.5 text-sm font-semibold text-uva-blue hover:text-uva-orange transition-colors mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back to Forum
      </Link>

      <div className="bg-panel-bg p-4 md:p-8 rounded-2xl border border-panel-border mb-8">
        <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-6 mb-6 text-center sm:text-left">
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-uva-orange flex items-center justify-center text-white text-2xl md:text-3xl font-bold uppercase shrink-0">
            {user.displayName.charAt(0)}
          </div>
          <div className="w-full min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold mb-1 text-heading break-words">{user.displayName}</h1>
            <p className="text-text-secondary text-base md:text-lg font-medium break-words">{user.major || 'Undeclared'} • Class of {user.gradYear || '2026'}</p>
            {user.bio && <p className="text-text-secondary text-sm md:text-base mt-2 break-words">{user.bio}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-panel-bg p-6 rounded-xl border border-panel-border">
          <h2 className="text-xl font-bold mb-5 text-heading">Activity</h2>
          <div className="space-y-4">
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
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Participant
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
