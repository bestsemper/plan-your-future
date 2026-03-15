"use client";

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateCurrentUserProfile } from '../actions';

type EditProfileFormProps = {
  displayName: string;
  major: string | null;
  gradYear: number | null;
  bio: string | null;
};

export default function EditProfileForm({
  displayName,
  major,
  gradYear,
  bio,
}: EditProfileFormProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [formDisplayName, setFormDisplayName] = useState(displayName);
  const [formMajor, setFormMajor] = useState(major ?? '');
  const [formGradYear, setFormGradYear] = useState(gradYear ? String(gradYear) : '');
  const [formBio, setFormBio] = useState(bio ?? '');

  const handleCancel = () => {
    setFormDisplayName(displayName);
    setFormMajor(major ?? '');
    setFormGradYear(gradYear ? String(gradYear) : '');
    setFormBio(bio ?? '');
    setError(null);
    setIsEditing(false);
  };

  const handleSave = () => {
    setError(null);

    startTransition(async () => {
      const res = await updateCurrentUserProfile({
        displayName: formDisplayName,
        major: formMajor,
        gradYear: formGradYear,
        bio: formBio,
      });

      if (res?.error) {
        setError(res.error);
        return;
      }

      setIsEditing(false);
      router.refresh();
    });
  };

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="w-full sm:w-auto bg-uva-blue/90 text-white px-5 py-2.5 rounded-xl hover:bg-uva-blue font-bold transition-colors cursor-pointer"
      >
        Edit Profile
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={handleCancel}>
      <div
        className="bg-panel-bg rounded-2xl border border-panel-border shadow-xl max-w-2xl w-full max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
          {/* Header */}
          <div className="bg-panel-bg border-b border-panel-border px-4 md:px-8 py-4 md:py-6 flex justify-between items-center gap-4">
            <h2 className="text-xl md:text-2xl font-bold text-heading">Edit Profile</h2>
            <button
              type="button"
              onClick={handleCancel}
              className="text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Form Content */}
          <div className="px-4 md:px-8 py-4 md:py-6 space-y-6 overflow-y-auto">
            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">Display Name</label>
              <input
                type="text"
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
                className="w-full px-4 py-3 border border-panel-border rounded-xl bg-input-bg text-text-primary outline-none focus:border-uva-blue focus:ring-2 focus:ring-uva-blue/20 transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">Major</label>
              <input
                type="text"
                value={formMajor}
                onChange={(e) => setFormMajor(e.target.value)}
                placeholder="e.g., Computer Science"
                className="w-full px-4 py-3 border border-panel-border rounded-xl bg-input-bg text-text-primary outline-none focus:border-uva-blue focus:ring-2 focus:ring-uva-blue/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">Graduation Year</label>
              <input
                type="number"
                value={formGradYear}
                onChange={(e) => setFormGradYear(e.target.value)}
                placeholder="e.g., 2026"
                className="w-full px-4 py-3 border border-panel-border rounded-xl bg-input-bg text-text-primary outline-none focus:border-uva-blue focus:ring-2 focus:ring-uva-blue/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">Bio</label>
              <textarea
                value={formBio}
                onChange={(e) => setFormBio(e.target.value)}
                placeholder="Tell others about yourself..."
                rows={5}
                className="w-full px-4 py-3 border border-panel-border rounded-xl bg-input-bg text-text-primary outline-none focus:border-uva-blue focus:ring-2 focus:ring-uva-blue/20 transition-all resize-none"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-red-500 text-sm font-semibold">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-panel-bg border-t border-panel-border px-4 md:px-8 py-4 md:py-6 flex flex-col-reverse sm:flex-row justify-end gap-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isPending}
              className="w-full sm:w-auto px-6 py-2.5 border border-panel-border-strong rounded-xl font-semibold text-text-primary hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="w-full sm:w-auto px-6 py-2.5 bg-uva-blue/90 text-white rounded-xl font-semibold hover:bg-uva-blue transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
      </div>
    </div>
  );
}
