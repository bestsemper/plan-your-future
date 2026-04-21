import { getUserProfile } from '../../actions';
import Link from 'next/link';
import { Icon } from '../../components/Icon';

export default async function UserProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ computingId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { computingId } = await params;
  const resolvedSearchParams = await searchParams;
  const fromPath = typeof resolvedSearchParams.from === 'string' ? resolvedSearchParams.from : '/forum';
  
  const profileData = await getUserProfile(computingId);

  if ('error' in profileData) {
    return (
      <div className="max-w-5xl mx-auto py-4 md:py-8 px-4">
        <Link href={fromPath} className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary hover:text-uva-orange transition-colors mb-6">
          <Icon name="arrow-left" color="currentColor" width={16} height={16} className="w-4 h-4" aria-hidden="true" />
          Go back
        </Link>
        <div className="bg-panel-bg p-8 rounded-3xl border border-panel-border flex flex-col items-center text-center gap-3">
          <div className="w-16 h-16 rounded-full bg-panel-bg-alt flex items-center justify-center mb-2">
            <Icon name="user" color="currentColor" width={28} height={28} className="text-text-tertiary" />
          </div>
          <h1 className="text-2xl font-bold text-heading">User not found</h1>
          <p className="text-text-secondary text-sm">This account no longer exists.</p>
        </div>
      </div>
    );
  }

  const { user, postCount } = profileData;
  const isProfileHidden = user.profileVisibility === 'hidden';
  const hiddenMajor = user.major || 'Undeclared';
  const hiddenGradYear = user.gradYear ? `Class of ${user.gradYear}` : 'Graduation year not provided';

  // If profile is hidden, show minimal view
  if (isProfileHidden) {
    return (
      <div className="max-w-5xl mx-auto py-4 md:py-8">
        <Link href={fromPath} className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary hover:text-uva-orange transition-colors mb-6">
          <Icon name="arrow-left" color="currentColor" width={16} height={16} className="w-4 h-4" aria-hidden="true" />
          Go back
        </Link>

        <div className="bg-panel-bg p-4 md:p-8 rounded-2xl border border-panel-border mb-8">
          <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-6 mb-6 text-center sm:text-left">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gray-400 flex items-center justify-center text-white text-2xl md:text-3xl font-bold uppercase shrink-0">
              ?
            </div>
            <div className="w-full min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold mb-1 text-heading">Anonymous User</h1>
              <p className="text-text-secondary text-base md:text-lg font-medium break-words">
                This user has chosen to keep their profile private.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-panel-bg p-6 rounded-3xl border border-panel-border">
          <h2 className="text-xl font-bold mb-5 text-heading">Academic Info</h2>
          <div className="space-y-4">
            <div className="flex justify-between border-b pb-3 border-panel-border">
              <span className="text-text-secondary font-medium">Major</span>
              <span className="font-bold text-text-primary text-right">{hiddenMajor}</span>
            </div>
            <div className="flex justify-between border-b pb-3 border-panel-border">
              <span className="text-text-secondary font-medium">Graduation</span>
              <span className="font-bold text-text-primary text-right">{hiddenGradYear}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const profileSummary = [
    user.major || 'Undeclared',
    user.currentAcademicYear ? `Year ${user.currentAcademicYear}` : null,
    user.gradYear ? `Class of ${user.gradYear}` : null,
  ].filter(Boolean).join(' • ');

  return (
    <div className="max-w-5xl mx-auto py-4 md:py-8">
      <Link href={fromPath} className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary hover:text-uva-orange transition-colors mb-6">
        <Icon name="arrow-left" color="currentColor" width={16} height={16} className="w-4 h-4" aria-hidden="true" />
        Go back
      </Link>

      <div className="bg-panel-bg p-4 md:p-8 rounded-2xl border border-panel-border mb-8">
        <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-6 mb-6 text-center sm:text-left">
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-uva-orange flex items-center justify-center text-white text-2xl md:text-3xl font-bold uppercase shrink-0">
            {user.displayName.charAt(0)}
          </div>
          <div className="w-full min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold mb-1 text-heading break-words">{user.displayName}</h1>
            <p className="text-text-secondary text-base md:text-lg font-medium break-words">
              {profileSummary}
            </p>
            {user.additionalPrograms.length > 0 && (
              <p className="text-text-secondary text-sm md:text-base mt-2 break-words">Programs: {user.additionalPrograms.join(', ')}</p>
            )}
            {user.bio && <p className="text-text-secondary text-sm md:text-base mt-2 break-words">{user.bio}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-panel-bg p-6 rounded-3xl border border-panel-border">
          <h2 className="text-xl font-bold mb-5 text-heading">Activity</h2>
          <div className="space-y-4">
            <div className="flex justify-between border-b pb-3 border-panel-border">
              <span className="text-text-secondary font-medium">Forum Posts</span>
              <span className="font-bold text-text-primary">{postCount}</span>
            </div>
          </div>
        </div>

        <div className="bg-panel-bg p-6 rounded-3xl border border-panel-border">
          <h2 className="text-xl font-bold mb-5 text-heading">Badges</h2>
          <div className="flex gap-3 flex-wrap">
            <div className="bg-badge-orange-bg text-uva-orange px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-bold border border-uva-orange/30">
              <Icon name="star" color="currentColor" width={16} height={16} className="w-4 h-4" /> Participant
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
