"use client";

import { useState, useTransition } from 'react';
import { updateProfileVisibility } from '../actions';
import DeleteAccountButton from './DeleteAccountButton';

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
      if (res?.error) setError(res.error);
    });
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-heading mb-4">Privacy Settings</h2>

      {error && (
        <div className="mb-3 bg-red-500/10 border border-red-500/40 text-red-500 px-4 py-2 rounded-xl text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <div className="bg-panel-bg rounded-3xl border border-panel-border flex items-center justify-between gap-4 px-5 py-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">Anonymous Mode</p>
            <p className="text-sm text-text-secondary mt-0.5">
              {isHidden
                ? "Your profile is hidden. Posts appear as 'Anonymous User'."
                : "Your profile is public. You can still post anonymously per post."}
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggle}
            disabled={isPending}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              isHidden ? 'bg-uva-orange' : 'bg-text-tertiary/30'
            }`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${isHidden ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        <div className="bg-panel-bg rounded-3xl border border-panel-border flex items-center justify-between gap-4 px-5 py-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">Delete Account</p>
            <p className="text-sm text-text-secondary mt-0.5">Permanently delete your account and all associated data.</p>
          </div>
          <DeleteAccountButton />
        </div>
      </div>
    </div>
  );
}
