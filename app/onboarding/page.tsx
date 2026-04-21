"use client";

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getCurrentUser } from '../actions';
import OnboardingForm from './OnboardingForm';

export default function OnboardingPage() {
  const router = useRouter();
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getCurrentUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setIsAuthed(true);
    };

    checkAuth();
  }, [router]);

  if (isAuthed === null) {
    return (
      <div className="max-w-5xl mx-auto py-10 px-4 text-center text-text-secondary">
        Loading…
      </div>
    );
  }

  return <OnboardingForm />;
}
