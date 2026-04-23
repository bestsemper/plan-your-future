"use client";

import { useState, useTransition } from 'react';
import { updateProfileVisibility, updateAnonymousMode } from '../actions';

function Toggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
        active ? 'bg-uva-blue' : 'bg-hover-bg'
      }`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200 ease-in-out ${active ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

interface PrivacySettingsProps {
  currentProfileVisibility: string;
  currentAnonymousMode: boolean;
}

export default function PrivacySettings({ currentProfileVisibility, currentAnonymousMode }: PrivacySettingsProps) {
  const [, startVisibilityTransition] = useTransition();
  const [, startAnonymousTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(currentProfileVisibility === 'public');
  const [isAnonymous, setIsAnonymous] = useState(currentAnonymousMode);

  const handleVisibilityToggle = () => {
    const next = !isPublic;
    setIsPublic(next);
    setError(null);
    startVisibilityTransition(async () => {
      const res = await updateProfileVisibility(next ? 'public' : 'hidden');
      if (res?.error) { setError(res.error); setIsPublic(!next); }
    });
  };

  const handleAnonymousToggle = () => {
    const next = !isAnonymous;
    setIsAnonymous(next);
    setError(null);
    startAnonymousTransition(async () => {
      const res = await updateAnonymousMode(next);
      if (res?.error) { setError(res.error); setIsAnonymous(!next); }
    });
  };

  return (
    <div>
      <p className="text-xs font-semibold text-text-tertiary uppercase tracking-widest mb-3">Privacy</p>

      {error && (
        <div className="mb-3 bg-red-500/10 border border-red-500/40 text-red-500 px-4 py-2 rounded-xl text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="bg-panel-bg border border-panel-border rounded-3xl overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-panel-border">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">Public Profile</p>
            <p className="text-xs text-text-secondary mt-0.5">Others can view your profile page.</p>
          </div>
          <Toggle active={isPublic} onClick={handleVisibilityToggle}  />
        </div>

        <div className="flex items-center justify-between gap-4 px-5 py-3.5">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">Anonymous Mode</p>
            <p className="text-xs text-text-secondary mt-0.5">Hide name on all forum posts.</p>
          </div>
          <Toggle active={isAnonymous} onClick={handleAnonymousToggle}  />
        </div>
      </div>
    </div>
  );
}
