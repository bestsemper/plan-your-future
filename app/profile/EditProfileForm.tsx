"use client";

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateCurrentUserProfile } from '../actions';
import CustomSelect from '../components/CustomSelect';
import { PROFILE_MAJOR_OPTIONS, PROFILE_SCHOOL_OPTIONS } from './profileOptions';

type EditProfileFormProps = {
  displayName: string;
  school: string | null;
  major: string | null;
  additionalPrograms: string[];
  gradYear: number | null;
  bio: string | null;
};

export default function EditProfileForm({
  displayName,
  school,
  major,
  additionalPrograms,
  gradYear,
  bio,
}: EditProfileFormProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [formDisplayName, setFormDisplayName] = useState(displayName);
  const [formSchool, setFormSchool] = useState(school ?? '');
  const [formMajor, setFormMajor] = useState(major ?? '');
  const [formAdditionalPrograms, setFormAdditionalPrograms] = useState(additionalPrograms.join('\n'));
  const [formGradYear, setFormGradYear] = useState(gradYear ? String(gradYear) : '');
  const [formBio, setFormBio] = useState(bio ?? '');

  const schoolOptions = useMemo(
    () => PROFILE_SCHOOL_OPTIONS.map((option) => ({ value: option, label: option })),
    [],
  );

  const majorOptions = useMemo(() => {
    const options = new Set<string>(PROFILE_MAJOR_OPTIONS);
    if (formMajor.trim()) {
      options.add(formMajor.trim());
    }

    return Array.from(options)
      .sort((left, right) => left.localeCompare(right))
      .map((option) => ({ value: option, label: option }));
  }, [formMajor]);

  const handleCancel = () => {
    setFormDisplayName(displayName);
    setFormSchool(school ?? '');
    setFormMajor(major ?? '');
    setFormAdditionalPrograms(additionalPrograms.join('\n'));
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
        school: formSchool,
        major: formMajor,
        additionalPrograms: formAdditionalPrograms,
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
              <label className="block text-sm font-semibold text-text-secondary mb-2">School</label>
              <CustomSelect
                value={formSchool}
                onChange={setFormSchool}
                options={schoolOptions}
                placeholder="Select your school"
                emptyLabel="No school selected"
                searchable
                searchPlaceholder="Search schools"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">Major</label>
              <CustomSelect
                value={formMajor}
                onChange={setFormMajor}
                options={majorOptions}
                placeholder="Select your major"
                emptyLabel="Undeclared"
                searchable
                searchPlaceholder="Search majors"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">Additional Programs</label>
              <textarea
                value={formAdditionalPrograms}
                onChange={(e) => setFormAdditionalPrograms(e.target.value)}
                placeholder="One per line: minor, certificate, concentration, second major, etc."
                rows={4}
                className="w-full px-4 py-3 border border-panel-border rounded-xl bg-input-bg text-text-primary outline-none focus:border-uva-blue focus:ring-2 focus:ring-uva-blue/20 transition-all resize-none"
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
