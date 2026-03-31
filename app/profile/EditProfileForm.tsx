"use client";

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateCurrentUserProfile } from '../actions';
import CustomSelect from '../components/CustomSelect';
import { Icon } from '../components/Icon';
import { getDefaultGraduationYearForStanding, getDefaultStandingForGraduationYear } from '../utils/academicYear';
import { PROFILE_SCHOOL_OPTIONS, PROFILE_MAJOR_OPTIONS, PROFILE_ADDITIONAL_PROGRAMS, MAJOR_TO_SCHOOL_MAP } from './profileOptions';

type EditProfileFormProps = {
  displayName: string;
  major: string | null;
  additionalPrograms: string[];
  currentAcademicYear: number | null;
  gradYear: number | null;
  bio: string | null;
};

export default function EditProfileForm({
  displayName,
  major,
  additionalPrograms,
  currentAcademicYear,
  gradYear,
  bio,
}: EditProfileFormProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [formDisplayName, setFormDisplayName] = useState(displayName);
  const [formMajor, setFormMajor] = useState(major ?? '');
  const [formSchool, setFormSchool] = useState<string>(() => {
    if (major) {
      const school = MAJOR_TO_SCHOOL_MAP.get(major);
      return school ?? '';
    }
    return '';
  });
  const [formAdditionalPrograms, setFormAdditionalPrograms] = useState(additionalPrograms);
  const [formCurrentAcademicYear, setFormCurrentAcademicYear] = useState(currentAcademicYear ? String(currentAcademicYear) : '');
  const [formGradYear, setFormGradYear] = useState(gradYear ? String(gradYear) : '');
  const [formBio, setFormBio] = useState(bio ?? '');
  const startedWithNoAcademicInfo = currentAcademicYear === null && gradYear === null;

  const hasChanges = useMemo(() => {
    return (
      formDisplayName !== displayName ||
      formMajor !== (major ?? '') ||
      formSchool !== (MAJOR_TO_SCHOOL_MAP.get(major ?? '') ?? '') ||
      JSON.stringify(formAdditionalPrograms.sort()) !== JSON.stringify([...(additionalPrograms ?? [])].sort()) ||
      formCurrentAcademicYear !== (currentAcademicYear ? String(currentAcademicYear) : '') ||
      formGradYear !== (gradYear ? String(gradYear) : '') ||
      formBio !== (bio ?? '')
    );
  }, [formDisplayName, formMajor, formSchool, formAdditionalPrograms, formCurrentAcademicYear, formGradYear, formBio, displayName, major, additionalPrograms, currentAcademicYear, gradYear, bio]);

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

  const academicYearOptions = useMemo(
    () => [
      { value: '1', label: '1st Year' },
      { value: '2', label: '2nd Year' },
      { value: '3', label: '3rd Year' },
      { value: '4', label: '4th Year' },
      { value: '5', label: 'Graduate' },
    ],
    [],
  );

  const gradYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, idx) => {
      const year = currentYear - 1 + idx;
      return { value: String(year), label: String(year) };
    });
  }, []);

  const handleCancel = () => {
    setFormDisplayName(displayName);
    setFormMajor(major ?? '');
    if (major) {
      const school = MAJOR_TO_SCHOOL_MAP.get(major);
      setFormSchool(school ?? '');
    } else {
      setFormSchool('');
    }
    setFormAdditionalPrograms(additionalPrograms);
    setFormCurrentAcademicYear(currentAcademicYear ? String(currentAcademicYear) : '');
    setFormGradYear(gradYear ? String(gradYear) : '');
    setFormBio(bio ?? '');
    setError(null);
    setIsEditing(false);
  };

  const handleMajorChange = (value: string) => {
    setFormMajor(value);
    
    // Auto-populate school based on major selection
    const schoolForMajor = MAJOR_TO_SCHOOL_MAP.get(value);
    setFormSchool(schoolForMajor ?? '');
  };

  const handleAcademicYearChange = (value: string) => {
    setFormCurrentAcademicYear(value);

    if (!startedWithNoAcademicInfo || formGradYear || !value) {
      return;
    }

    const parsedYear = Number.parseInt(value, 10);
    if (Number.isNaN(parsedYear) || parsedYear < 1) {
      return;
    }

    setFormGradYear(String(getDefaultGraduationYearForStanding(parsedYear)));
  };

  const handleGradYearChange = (value: string) => {
    setFormGradYear(value);

    if (!startedWithNoAcademicInfo || formCurrentAcademicYear || !value) {
      return;
    }

    const parsedYear = Number.parseInt(value, 10);
    if (Number.isNaN(parsedYear)) {
      return;
    }

    setFormCurrentAcademicYear(String(getDefaultStandingForGraduationYear(parsedYear)));
  };

  const handleSave = () => {
    setError(null);

    startTransition(async () => {
      const res = await updateCurrentUserProfile({
        displayName: formDisplayName,
        school: formSchool || undefined,
        major: formMajor,
        additionalPrograms: formAdditionalPrograms.join('\n'),
        currentAcademicYear: formCurrentAcademicYear,
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
        className="w-full sm:w-auto bg-button-bg text-button-text px-5 py-2.5 rounded-xl hover:bg-button-hover font-bold transition-colors cursor-pointer"
      >
        Edit Profile
      </button>
    );
  }

  return (
    <div className="fixed z-50 flex items-center justify-center lg:inset-0 lg:bg-black/50 lg:p-4 max-lg:inset-x-0 max-lg:top-14 max-lg:bottom-0 max-lg:p-3" onClick={handleCancel}>
      <div 
        className="bg-panel-bg rounded-2xl border border-panel-border shadow-xl max-lg:shadow-none max-w-2xl w-full max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col max-lg:rounded-3xl max-lg:max-w-none max-lg:h-full max-lg:max-h-none"
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
              <Icon name="x" color="currentColor" width={24} height={24} className="w-6 h-6" />
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
              <CustomSelect
                value={formMajor}
                onChange={handleMajorChange}
                options={majorOptions}
                placeholder="Select your major"
                emptyLabel="Select your major"
                searchable
                searchPlaceholder="Search majors"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">School</label>
              <div className="w-full px-4 py-3 border border-panel-border rounded-xl bg-panel-bg-alt text-text-primary">
                {formSchool || <span className="text-text-tertiary">Select a major to auto-fill school</span>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">Additional Programs</label>
              <p className="text-xs text-text-tertiary mb-3">Select certificates, ROTC, honors programs, and other academic opportunities</p>
              <CustomSelect
                value={formAdditionalPrograms[0] ?? ''}
                onChange={(value) => {
                  if (value) {
                    setFormAdditionalPrograms([value]);
                  } else {
                    setFormAdditionalPrograms([]);
                  }
                }}
                options={PROFILE_ADDITIONAL_PROGRAMS.map((program) => ({ value: program, label: program }))}
                placeholder="Select additional programs"
                emptyLabel="No programs selected"
                searchable
                searchPlaceholder="Search programs"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">Current Academic Year</label>
              <CustomSelect
                value={formCurrentAcademicYear}
                onChange={handleAcademicYearChange}
                options={academicYearOptions}
                placeholder="Select current academic year"
                emptyLabel="No year selected"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">Graduation Year</label>
              <CustomSelect
                value={formGradYear}
                onChange={handleGradYearChange}
                options={gradYearOptions}
                placeholder="Select graduation year"
                emptyLabel="No graduation year selected"
                searchable
                searchPlaceholder="Search years"
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
              disabled={isPending || !hasChanges}
              className={`w-full sm:w-auto px-6 py-2.5 rounded-xl font-semibold transition-colors cursor-pointer ${
                hasChanges
                  ? 'bg-uva-blue/90 text-white hover:bg-uva-blue disabled:opacity-50 disabled:cursor-not-allowed'
                  : 'border border-panel-border-strong text-text-primary hover:bg-hover-bg disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
      </div>
    </div>
  );
}
