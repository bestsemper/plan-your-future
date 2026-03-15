'use client';

import { useState } from 'react';
import EditProfileForm from './EditProfileForm';
import EditCompletedCourses from './EditCompletedCourses';

interface ProfileActionsProps {
  displayName: string;
  major: string | null;
  gradYear: number | null;
  bio: string | null;
}

export default function ProfileActions({
  displayName,
  major,
  gradYear,
  bio,
}: ProfileActionsProps) {
  const [isCompletedCoursesOpen, setIsCompletedCoursesOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-start w-full">
        <EditProfileForm
          displayName={displayName}
          major={major}
          gradYear={gradYear}
          bio={bio}
        />
        <button
          onClick={() => setIsCompletedCoursesOpen(true)}
          className="w-full sm:w-auto border border-dashed border-panel-border-strong px-5 py-2.5 rounded-xl hover:bg-hover-bg text-text-primary font-semibold transition-colors cursor-pointer"
        >
          Transfer and Extra Courses
        </button>
      </div>

      <EditCompletedCourses
        isOpen={isCompletedCoursesOpen}
        onClose={() => setIsCompletedCoursesOpen(false)}
        onCoursesChanged={() => {
          // Optionally refresh or show a notification
        }}
      />
    </>
  );
}
