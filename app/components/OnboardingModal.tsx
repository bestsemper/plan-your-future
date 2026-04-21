/**
 * INSTRUCTIONS FOR USERS:
 * 
 * Audit Report (Completed Courses):
 * Open Stellic → Plan your Path → Print Audit Report → Create audit report
 * 
 * Stellic Plan (Academic Plan):
 * Open Stellic → Plan your Path → Download Plan → Create plan report
 */

"use client";

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition, useMemo } from 'react';
import { updateCurrentUserProfile, importCompletedCoursesFromAuditPdf, importPlanFromStellicPdf, createEmptyPlan } from '../actions';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from '../components/DropdownMenu';
import { Icon } from '../components/Icon';
import { PROFILE_SCHOOL_OPTIONS, PROFILE_MAJOR_OPTIONS, PROFILE_ADDITIONAL_PROGRAMS, MAJOR_TO_SCHOOL_MAP } from '../profile/profileOptions';
import { getDefaultGraduationYearForStanding, getDefaultStandingForGraduationYear } from '../utils/academicYear';

export default function OnboardingModal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isOpen = searchParams.get('newUser') === '1' && !searchParams.get('readyForTutorial');

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formMajor, setFormMajor] = useState('');
  const [formSchool, setFormSchool] = useState('');
  const [formAdditionalPrograms, setFormAdditionalPrograms] = useState<string[]>([]);
  const [formCurrentAcademicYear, setFormCurrentAcademicYear] = useState('');
  const [formGradYear, setFormGradYear] = useState('');
  const [formBio, setFormBio] = useState('');
  const [auditFile, setAuditFile] = useState<File | null>(null);
  const [planFile, setPlanFile] = useState<File | null>(null);

  // Dropdown states
  const [isMajorOpen, setIsMajorOpen] = useState(false);
  const [isMajorSearching, setIsMajorSearching] = useState(false);
  const [isSchoolOpen, setIsSchoolOpen] = useState(false);
  const [isAdditionalProgramsOpen, setIsAdditionalProgramsOpen] = useState(false);
  const [isAcademicYearOpen, setIsAcademicYearOpen] = useState(false);
  const [isGradYearOpen, setIsGradYearOpen] = useState(false);
  const [majorSearch, setMajorSearch] = useState('');
  const [additionalProgramsSearch, setAdditionalProgramsSearch] = useState('');
  const [gradYearSearch, setGradYearSearch] = useState('');

  const startedWithNoAcademicInfo = formCurrentAcademicYear === '' && formGradYear === '';

  const majorOptions = useMemo(() => {
    const options = new Set<string>(PROFILE_MAJOR_OPTIONS);
    if (formMajor.trim()) {
      options.add(formMajor.trim());
    }
    return Array.from(options)
      .sort((left, right) => left.localeCompare(right))
      .map((option) => ({ value: option, label: option }));
  }, [formMajor]);

  const filteredMajorOptions = useMemo(() => {
    if (!majorSearch.trim()) return majorOptions;
    const query = majorSearch.toLowerCase();
    return majorOptions.filter(opt => opt.label.toLowerCase().includes(query));
  }, [majorOptions, majorSearch]);

  const filteredAdditionalPrograms = useMemo(() => {
    if (!additionalProgramsSearch.trim()) return PROFILE_ADDITIONAL_PROGRAMS;
    const query = additionalProgramsSearch.toLowerCase();
    return PROFILE_ADDITIONAL_PROGRAMS.filter(prog => prog.toLowerCase().includes(query));
  }, [additionalProgramsSearch]);

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

  const filteredGradYearOptions = useMemo(() => {
    if (!gradYearSearch.trim()) return gradYearOptions;
    const query = gradYearSearch.toLowerCase();
    return gradYearOptions.filter(opt => opt.label.toLowerCase().includes(query));
  }, [gradYearOptions, gradYearSearch]);

  const handleMajorChange = (value: string) => {
    setFormMajor(value);
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

  const handleSkip = () => {
    router.push('/');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await updateCurrentUserProfile({
        displayName: formDisplayName,
        school: formSchool,
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

      // Import audit PDF if provided
      if (auditFile) {
        try {
          const dataUrl = await fileToDataUrl(auditFile);
          await importCompletedCoursesFromAuditPdf({
            pdfBase64: dataUrl,
            selection: 'both',
          });
        } catch (err) {
          console.error('Error importing audit PDF:', err);
        }
      }

      // Import plan PDF if provided
      if (planFile) {
        try {
          const dataUrl = await fileToDataUrl(planFile);
          await importPlanFromStellicPdf({
            pdfBase64: dataUrl,
            mode: 'new',
            newPlanTitle: 'My Academic Plan',
          });
        } catch (err) {
          console.error('Error importing plan PDF:', err);
        }
      } else {
        // Create empty plan if no stellic plan was uploaded
        try {
          await createEmptyPlan();
        } catch (err) {
          console.error('Error creating empty plan:', err);
        }
      }

      // Close modal and trigger tutorial with readyForTutorial flag
      router.push(`/?readyForTutorial=1`);
      
      // Dispatch event to signal tutorial should start
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('onboarding:complete'));
      }, 100);
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-panel-bg border border-panel-border rounded-3xl shadow-xl p-6 md:p-8 my-8">
        <div className="flex flex-col mb-7 border-b border-panel-border pb-6">
          <h1 className="text-3xl font-bold text-heading mb-2">Welcome to Hoos Plan!</h1>
          <p className="text-text-secondary text-sm font-medium">
            Let's complete your profile. You can edit these anytime.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 max-h-[calc(100vh-300px)] overflow-y-auto pr-2">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2">
              <Icon name="alert-circle" color="currentColor" width={16} height={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Display Name */}
          <div>
            <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">
              Display Name
            </label>
            <input
              type="text"
              value={formDisplayName}
              onChange={(e) => setFormDisplayName(e.target.value)}
              placeholder="Your name"
              className="w-full p-3 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-colors focus:border-uva-blue"
              required
            />
          </div>

          {/* Major */}
          <div>
            <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">
              Major
            </label>
            {formMajor ? (
              <div className="w-full px-4 py-3 border border-panel-border rounded-full bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between gap-3 hover:border-panel-border-strong transition-all"
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
                  className="text-text-secondary hover:text-danger-text cursor-pointer transition-all"
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
                      key={option.value}
                      selected={formMajor === option.value}
                      onClick={() => {
                        handleMajorChange(option.value);
                        setIsMajorOpen(false);
                        setMajorSearch('');
                        setIsMajorSearching(false);
                      }}
                    >
                      {option.label}
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
                <span className="truncate text-text-tertiary">Select a major</span>
                <Icon name="chevron-down" color="currentColor" width={16} height={16} className="w-4 h-4 shrink-0" />
              </button>
            )}
          </div>

          {/* School */}
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
                  <Icon name="chevron-down" color="currentColor" width={16} height={16} className="w-4 h-4 shrink-0" />
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

          {/* Additional Programs */}
          <div>
            <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">
              Additional Programs (Optional)
            </label>
            <DropdownMenu isOpen={isAdditionalProgramsOpen} onOpenChange={setIsAdditionalProgramsOpen} trigger={
              <button
                type="button"
                className="w-full px-4 py-3 border border-panel-border rounded-full bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between gap-3 focus:outline-none hover:border-panel-border-strong transition-all"
              >
                <span className="text-text-tertiary">
                  {formAdditionalPrograms.length > 0 
                    ? `${formAdditionalPrograms.length} selected` 
                    : 'Select programs'}
                </span>
                <Icon name="chevron-down" color="currentColor" width={16} height={16} className="w-4 h-4 shrink-0" />
              </button>
            }>
              <DropdownMenuContent maxHeight="max-h-48">
                <input
                  type="text"
                  placeholder="Search programs..."
                  value={additionalProgramsSearch}
                  onChange={(e) => setAdditionalProgramsSearch(e.target.value)}
                  className="w-full px-3 py-2 border-b border-panel-border bg-input-bg text-text-primary placeholder:text-text-tertiary outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
                {filteredAdditionalPrograms.map((program) => (
                  <DropdownMenuItem
                    key={program}
                    selected={formAdditionalPrograms.includes(program)}
                    onClick={() => {
                      setFormAdditionalPrograms(prev =>
                        prev.includes(program)
                          ? prev.filter(p => p !== program)
                          : [...prev, program]
                      );
                    }}
                  >
                    {program}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Current Academic Year */}
          <div>
            <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">
              Current Academic Year (Optional)
            </label>
            <DropdownMenu isOpen={isAcademicYearOpen} onOpenChange={setIsAcademicYearOpen} trigger={
              <button
                type="button"
                className="w-full px-4 py-3 border border-panel-border rounded-full bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between gap-3"
              >
                <span className="text-text-tertiary">
                  {formCurrentAcademicYear
                    ? academicYearOptions.find(y => y.value === formCurrentAcademicYear)?.label
                    : 'Select year'}
                </span>
                <Icon name="chevron-down" color="currentColor" width={16} height={16} className="w-4 h-4 shrink-0" />
              </button>
            }>
              <DropdownMenuContent>
                {academicYearOptions.map((year) => (
                  <DropdownMenuItem
                    key={year.value}
                    selected={formCurrentAcademicYear === year.value}
                    onClick={() => {
                      handleAcademicYearChange(year.value);
                      setIsAcademicYearOpen(false);
                    }}
                  >
                    {year.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Graduation Year */}
          <div>
            <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">
              Graduation Year (Optional)
            </label>
            <DropdownMenu isOpen={isGradYearOpen} onOpenChange={setIsGradYearOpen} trigger={
              <button
                type="button"
                className="w-full px-4 py-3 border border-panel-border rounded-full bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between gap-3"
              >
                <span className="text-text-tertiary">
                  {formGradYear || 'Select year'}
                </span>
                <Icon name="chevron-down" color="currentColor" width={16} height={16} className="w-4 h-4 shrink-0" />
              </button>
            }>
              <DropdownMenuContent maxHeight="max-h-64">
                <input
                  type="text"
                  placeholder="Search year..."
                  value={gradYearSearch}
                  onChange={(e) => setGradYearSearch(e.target.value)}
                  className="w-full px-3 py-2 border-b border-panel-border bg-input-bg text-text-primary placeholder:text-text-tertiary outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
                {filteredGradYearOptions.map((year) => (
                  <DropdownMenuItem
                    key={year.value}
                    selected={formGradYear === year.value}
                    onClick={() => {
                      handleGradYearChange(year.value);
                      setIsGradYearOpen(false);
                      setGradYearSearch('');
                    }}
                  >
                    {year.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">
              Bio (Optional)
            </label>
            <textarea
              value={formBio}
              onChange={(e) => setFormBio(e.target.value)}
              placeholder="Tell us about yourself..."
              max-length={500}
              rows={3}
              className="w-full p-3 border border-panel-border rounded-2xl bg-input-bg text-text-primary outline-none transition-colors focus:border-uva-blue resize-none"
            />
          </div>

          {/* Audit PDF Upload */}
          <div>
            <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">
              Completed Courses (Audit PDF - Optional)
            </label>
            <label className="w-full px-4 py-3 border border-panel-border rounded-full bg-input-bg text-text-primary cursor-pointer flex items-center justify-between gap-3 hover:border-panel-border-strong transition-all">
              <span className="truncate text-text-tertiary">
                {auditFile ? auditFile.name : 'Choose audit PDF'}
              </span>
              <Icon name="plus" color="currentColor" width={16} height={16} className="w-4 h-4 shrink-0" />
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setAuditFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
            <p className="text-xs text-text-tertiary mt-2">Open Stellic → Plan your Path → Print Audit Report → Create audit report</p>
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
              <Icon name="plus" color="currentColor" width={16} height={16} className="w-4 h-4 shrink-0" />
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setPlanFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
            <p className="text-xs text-text-tertiary mt-2">Open Stellic → Plan your Path → Download Plan → Create plan report</p>
          </div>
        </form>

        {/* Footer */}
        <div className="sticky bottom-0 bg-panel-bg border-t border-panel-border px-0 py-4 mt-6 flex flex-col-reverse sm:flex-row justify-end gap-3">
          <button
            type="button"
            onClick={handleSkip}
            disabled={isPending}
            className="w-full sm:w-auto px-4 py-2 border border-panel-border-strong rounded-full font-semibold text-text-primary hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50"
          >
            Skip for Now
          </button>
          <button
            type="submit"
            disabled={!formDisplayName || !formMajor || isPending}
            onClick={handleSubmit}
            className="w-full sm:w-auto px-4 py-2 rounded-full font-semibold transition-colors cursor-pointer bg-button-bg text-button-text hover:bg-button-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Setting Up...' : 'Get Started'}
          </button>
        </div>
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
