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
    <div className="bg-panel-bg p-6 rounded-xl border border-panel-border">
      <h2 className="text-xl font-bold mb-5 text-heading">Privacy Settings</h2>
      
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/40 text-red-500 px-4 py-2 rounded-xl text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 pr-4">
            <h3 className="text-sm font-semibold text-text-primary mb-1">Anonymous Mode</h3>
            <p className="text-xs text-text-secondary">
              {isHidden
                ? "Your profile is hidden. Posts appear as 'Anonymous User' unless made public individually."
                : "Your profile is public. You can still post anonymously on a per-post basis."
              }
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleToggle}
              disabled={isPending}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isHidden
                  ? 'bg-uva-orange/90 hover:bg-uva-orange'
                  : 'bg-gray-300 hover:bg-gray-400'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isHidden ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            {isHidden && (
              <span className="text-xs font-semibold text-uva-orange whitespace-nowrap">
                (anonymous mode on)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
