"use client";

import { useState, useTransition } from 'react';
import { updateProfileVisibility } from '../actions';

interface PrivacySettingsProps {
  currentProfileVisibility: string;
}

export default function PrivacySettings({ currentProfileVisibility }: PrivacySettingsProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isHidden = currentProfileVisibility === 'hidden';

  const handleToggle = () => {
    setError(null);
    startTransition(async () => {
      const newVisibility = isHidden ? 'public' : 'hidden';
      const res = await updateProfileVisibility(newVisibility);
      if (res?.error) {
        setError(res.error);
      }
    });
  };

  return (
    <div className="bg-panel-bg p-6 rounded-3xl border border-panel-border">
      <h2 className="text-xl font-bold mb-5 text-heading">Privacy Settings</h2>
      
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/40 text-red-500 px-4 py-2 rounded-xl text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-heading mb-1 truncate">Anonymous Mode</h3>
            <p className="text-[13px] font-medium text-text-secondary leading-snug">
              {isHidden
                ? "Your profile is hidden. Posts appear as 'Anonymous User' unless made public individually."
                : "Your profile is public. You can still post anonymously on a per-post basis."
              }
            </p>
          </div>
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleToggle}
              disabled={isPending}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isHidden
                  ? 'bg-button-bg'
                  : 'bg-panel-border-strong text-transparent'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${
                  isHidden ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
