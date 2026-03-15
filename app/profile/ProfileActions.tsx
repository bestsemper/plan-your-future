'use client';

import { useState } from 'react';
import EditProfileForm from './EditProfileForm';
import ImportPlan from './ImportPlan';
import EditCompletedCourses from './EditCompletedCourses';

interface ProfileActionsProps {
  displayName: string;
  major: string | null;
  gradYear: number | null;
  bio: string | null;
  plans: Array<{ id: string; title: string }>;
}

export default function ProfileActions({
  displayName,
  major,
  gradYear,
  bio,
  plans,
}: ProfileActionsProps) {
  const [isCompletedCoursesOpen, setIsCompletedCoursesOpen] = useState(false);

  return (
    <>
      <div className="flex gap-4 items-start flex-wrap">
        <EditProfileForm
          displayName={displayName}
          major={major}
          gradYear={gradYear}
          bio={bio}
        />
        <ImportPlan plans={plans} />
        <button
          onClick={() => setIsCompletedCoursesOpen(true)}
          className="px-4 py-2 rounded-lg bg-uva-orange text-white font-semibold hover:bg-opacity-90 transition"
        >
          Completed Courses
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
