"use client";

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { updateCurrentUserProfile, importCompletedCoursesFromAuditPdf, importPlanFromStellicPdf, getCurrentUser } from '../actions';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from '../components/DropdownMenu';
import { Icon } from '../components/Icon';
import { PROFILE_SCHOOL_OPTIONS, PROFILE_MAJOR_OPTIONS, MAJOR_TO_SCHOOL_MAP } from '../profile/profileOptions';

export default function OnboardingForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [isMajorOpen, setIsMajorOpen] = useState(false);
  const [isMajorSearching, setIsMajorSearching] = useState(false);
  const [isSchoolOpen, setIsSchoolOpen] = useState(false);
  const [majorSearch, setMajorSearch] = useState('');

  const [formMajor, setFormMajor] = useState('');
  const [formSchool, setFormSchool] = useState('');
  const [auditFile, setAuditFile] = useState<File | null>(null);
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const majorOptions = PROFILE_MAJOR_OPTIONS
    .concat(formMajor ? [formMajor] : [])
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort();

  const filteredMajorOptions = majorSearch.trim()
    ? majorOptions.filter(opt => opt.toLowerCase().includes(majorSearch.toLowerCase()))
    : majorOptions;

  const handleMajorChange = (value: string) => {
    setFormMajor(value);
    const school = MAJOR_TO_SCHOOL_MAP.get(value);
    setFormSchool(school ?? '');
    setIsMajorOpen(false);
    setIsMajorSearching(false);
  };

  const handleSkip = () => {
    // Just go to home, user can complete profile later
    router.push('/');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsImporting(true);

    try {
      startTransition(async () => {
        // Update profile with major and school
        const profileRes = await updateCurrentUserProfile({
          displayName: (await getCurrentUser())?.displayName ?? 'User',
          school: formSchool,
          major: formMajor,
        });

        if (profileRes?.error) {
          setError(profileRes.error);
          setIsImporting(false);
          return;
        }

        // Import audit PDF if provided
        if (auditFile) {
          try {
            const dataUrl = await fileToDataUrl(auditFile);
            const auditRes = await importCompletedCoursesFromAuditPdf({
              pdfBase64: dataUrl,
              selection: 'both',
            });
            if (auditRes?.error) {
              console.error('Audit import error:', auditRes.error);
            }
          } catch (err) {
            console.error('Error importing audit PDF:', err);
          }
        }

        // Import plan PDF if provided
        if (planFile) {
          try {
            const dataUrl = await fileToDataUrl(planFile);
            const planRes = await importPlanFromStellicPdf({
              pdfBase64: dataUrl,
              mode: 'new',
              newPlanTitle: 'My Academic Plan',
            });
            if (planRes?.error) {
              console.error('Plan import error:', planRes.error);
            }
          } catch (err) {
            console.error('Error importing plan PDF:', err);
          }
        }

        // Redirect to home on success
        router.push('/');
      });
    } catch (err) {
      setError('An error occurred. Please try again.');
      setIsImporting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="max-w-lg mx-auto bg-panel-bg border border-panel-border shadow-sm p-8 rounded-3xl">
        <div className="flex flex-col mb-7 border-b border-panel-border pb-6">
          <h1 className="text-3xl font-bold text-heading mb-2">Welcome to Hoos Plan!</h1>
          <p className="text-text-secondary text-sm font-medium">
            Let's get your profile set up. You can fill in more details later.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2">
              <Icon name="alert-circle" color="currentColor" width={16} height={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Major Selection */}
          <div>
            <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">
              Major
            </label>
            {formMajor ? (
              <div className="w-full px-4 py-3 border border-panel-border rounded-full bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between gap-3 focus:outline-none hover:border-panel-border-strong transition-all"
                onClick={() => setIsMajorSearching(true)}
                role="button"
                tabIndex={0}
              >
                <span className="truncate flex-1">{formMajor}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFormMajor('');
                    setFormSchool('');
                    setMajorSearch('');
                    setIsMajorSearching(false);
                  }}
                  className="text-text-secondary hover:text-danger-text cursor-pointer flex items-center justify-center transition-all"
                >
                  <Icon name="x" color="currentColor" width={16} height={16} />
                </button>
              </div>
            ) : isMajorSearching ? (
              <DropdownMenu isOpen={isMajorOpen} onOpenChange={setIsMajorOpen} trigger={
                <input
                  type="text"
                  autoFocus
                  placeholder="Search majors..."
                  value={majorSearch}
                  onChange={(e) => {
                    setMajorSearch(e.target.value);
                    setIsMajorOpen(true);
                  }}
                  onClick={() => setIsMajorOpen(true)}
                  onBlur={() => {
                    setTimeout(() => {
                      if (majorSearch === '') {
                        setIsMajorSearching(false);
                        setIsMajorOpen(false);
                      }
                    }, 100);
                  }}
                  className="w-full px-4 py-3 border border-panel-border rounded-full bg-input-bg text-text-primary placeholder:text-text-tertiary outline-none transition-all"
                />
              }>
                <DropdownMenuContent maxHeight="max-h-64">
                  {filteredMajorOptions.map((option) => (
                    <DropdownMenuItem
                      key={option}
                      selected={formMajor === option}
                      onClick={() => handleMajorChange(option)}
                    >
                      {option}
                    </DropdownMenuItem>
                  ))}
                  {filteredMajorOptions.length === 0 && (
                    <div className="px-3 py-2 text-sm text-text-secondary">No majors found.</div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsMajorSearching(true);
                  setIsMajorOpen(true);
                }}
                className="w-full px-4 py-3 border border-panel-border rounded-full bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between gap-3 focus:outline-none hover:border-panel-border-strong transition-all"
              >
                <span className="truncate text-text-tertiary">Select your major</span>
                <Icon name="chevron-down" color="currentColor" width={16} height={16} className="w-4 h-4 shrink-0 text-text-secondary" />
              </button>
            )}
          </div>

          {/* School Selection */}
          {formMajor && (
            <div>
              <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">
                School
              </label>
              <DropdownMenu isOpen={isSchoolOpen} onOpenChange={setIsSchoolOpen} trigger={
                <button
                  type="button"
                  className="w-full px-4 py-3 border border-panel-border rounded-full bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between gap-3 focus:outline-none hover:border-panel-border-strong transition-all"
                >
                  <span>{formSchool}</span>
                  <Icon name="chevron-down" color="currentColor" width={16} height={16} className="w-4 h-4 shrink-0 text-text-secondary" />
                </button>
              }>
                <DropdownMenuContent>
                  {PROFILE_SCHOOL_OPTIONS.map((school) => (
                    <DropdownMenuItem
                      key={school}
                      selected={formSchool === school}
                      onClick={() => {
                        setFormSchool(school);
                        setIsSchoolOpen(false);
                      }}
                    >
                      {school}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Audit PDF Upload */}
          <div>
            <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">
              Completed Courses (Audit PDF - Optional)
            </label>
            <label className="w-full px-4 py-3 border border-panel-border rounded-full bg-input-bg text-text-primary cursor-pointer flex items-center justify-between gap-3 hover:border-panel-border-strong transition-all">
              <span className="truncate text-text-tertiary">
                {auditFile ? auditFile.name : 'Choose audit PDF'}
              </span>
              <Icon name="plus" color="currentColor" width={16} height={16} className="w-4 h-4 shrink-0 text-text-secondary" />
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setAuditFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
            <p className="text-xs text-text-tertiary mt-2">Upload your university audit PDF to import completed courses</p>
          </div>

          {/* Plan PDF Upload */}
          <div>
            <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">
              Academic Plan (Stellic PDF - Optional)
            </label>
            <label className="w-full px-4 py-3 border border-panel-border rounded-full bg-input-bg text-text-primary cursor-pointer flex items-center justify-between gap-3 hover:border-panel-border-strong transition-all">
              <span className="truncate text-text-tertiary">
                {planFile ? planFile.name : 'Choose plan PDF'}
              </span>
              <Icon name="plus" color="currentColor" width={16} height={16} className="w-4 h-4 shrink-0 text-text-secondary" />
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setPlanFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
            <p className="text-xs text-text-tertiary mt-2">Upload your Stellic plan PDF to import your academic courses</p>
          </div>

          {/* Buttons */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
            <button
              type="button"
              onClick={handleSkip}
              disabled={isPending || isImporting}
              className="w-full sm:w-auto px-4 py-2 border border-panel-border-strong rounded-full font-semibold text-text-primary hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50"
            >
              Skip for Now
            </button>
            <button
              type="submit"
              disabled={!formMajor || isPending || isImporting}
              className="w-full sm:w-auto px-4 py-2 rounded-full font-semibold transition-colors cursor-pointer bg-button-bg text-button-text hover:bg-button-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending || isImporting ? 'Setting Up...' : 'Get Started'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unable to read file as data URL.'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
}
