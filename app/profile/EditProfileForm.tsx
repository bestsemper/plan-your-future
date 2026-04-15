"use client";

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateCurrentUserProfile } from '../actions';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from '../components/DropdownMenu';
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
  
  const [isMajorOpen, setIsMajorOpen] = useState(false);
  const [isMajorSearching, setIsMajorSearching] = useState(false);
  const [isSchoolOpen, setIsSchoolOpen] = useState(false);
  const [isAdditionalProgramsOpen, setIsAdditionalProgramsOpen] = useState(false);
  const [isAdditionalProgramsSearching, setIsAdditionalProgramsSearching] = useState(false);
  const [isAcademicYearOpen, setIsAcademicYearOpen] = useState(false);
  const [isGradYearOpen, setIsGradYearOpen] = useState(false);
  
  const [majorSearch, setMajorSearch] = useState('');
  const [additionalProgramsSearch, setAdditionalProgramsSearch] = useState('');
  const [gradYearSearch, setGradYearSearch] = useState('');

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

  const filteredGradYearOptions = useMemo(() => {
    if (!gradYearSearch.trim()) return gradYearOptions;
    const query = gradYearSearch.toLowerCase();
    return gradYearOptions.filter(opt => opt.label.toLowerCase().includes(query));
  }, [gradYearOptions, gradYearSearch]);

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
        className="w-full sm:w-auto bg-button-bg text-button-text px-5 py-2.5 rounded-full hover:bg-button-hover font-bold transition-colors cursor-pointer"
      >
        Edit Profile
      </button>
    );
  }

  return (
    <div className="fixed z-50 flex items-center justify-center lg:inset-0 lg:bg-black/50 lg:p-4 max-lg:inset-x-0 max-lg:top-14 max-lg:bottom-0 max-lg:pt-0 max-lg:p-3" onClick={handleCancel}>
      <div 
        className="bg-panel-bg rounded-3xl border border-panel-border shadow-xl max-lg:shadow-none max-w-2xl w-full max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col max-lg:max-w-none max-lg:h-full max-lg:max-h-none"
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
                className="w-full px-4 py-3 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">Major</label>
              {!isMajorSearching && formMajor ? (
                // Show selected major with clear button
                <div className="w-full px-4 py-3 border border-panel-border rounded-full bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between gap-3 focus:outline-none hover:border-panel-border-strong transition-all relative"
                  onClick={() => setIsMajorSearching(true)}
                  role="button"
                  tabIndex={0}
                >
                  <span className="truncate flex-1">{majorOptions.find(o => o.value === formMajor)?.label ?? formMajor}</span>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setFormMajor('');
                      setMajorSearch('');
                      setIsMajorSearching(false);
                    }}
                    className="text-text-secondary hover:text-danger-text cursor-pointer flex items-center justify-center transition-all"
                    role="button"
                    tabIndex={-1}
                  >
                    <Icon
                      name="x"
                      color="currentColor"
                      width={16}
                      height={16}
                      className="w-4 h-4"
                    />
                  </div>
                </div>
              ) : isMajorSearching ? (
                // Show search input
                <DropdownMenu
                  isOpen={isMajorOpen}
                  onOpenChange={setIsMajorOpen}
                  trigger={
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search majors..."
                      value={majorSearch}
                      onChange={(e) => {
                        setMajorSearch(e.target.value);
                        setIsMajorOpen(true);
                      }}
                      onClick={() => {
                        setIsMajorOpen(true);
                      }}
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
                  }
                >
                  <DropdownMenuContent maxHeight="max-h-64">
                    <DropdownMenuItem
                      selected={formMajor === ''}
                      onClick={() => {
                        setFormMajor('');
                        setIsMajorOpen(false);
                        setMajorSearch('');
                        setIsMajorSearching(false);
                      }}
                    >
                      Select your major
                    </DropdownMenuItem>
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
                // Show select button
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

            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">School</label>
              <div className="w-full px-4 py-3 border border-panel-border rounded-full bg-panel-bg-alt text-text-primary">
                {formSchool || <span className="text-text-tertiary">Select a major to auto-fill school</span>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">Additional Programs</label>
              <p className="text-xs text-text-tertiary mb-3">Select certificates, ROTC, honors programs, and other academic opportunities</p>
              {!isAdditionalProgramsSearching && formAdditionalPrograms.length > 0 ? (
                // Show selected program with clear button
                <div className="w-full px-4 py-3 border border-panel-border rounded-full bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between gap-3 focus:outline-none hover:border-panel-border-strong transition-all relative"
                  onClick={() => setIsAdditionalProgramsSearching(true)}
                  role="button"
                  tabIndex={0}
                >
                  <span className="truncate flex-1">{formAdditionalPrograms[0]}</span>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setFormAdditionalPrograms([]);
                      setAdditionalProgramsSearch('');
                      setIsAdditionalProgramsSearching(false);
                    }}
                    className="text-text-secondary hover:text-danger-text cursor-pointer flex items-center justify-center transition-all"
                    role="button"
                    tabIndex={-1}
                  >
                    <Icon
                      name="x"
                      color="currentColor"
                      width={16}
                      height={16}
                      className="w-4 h-4"
                    />
                  </div>
                </div>
              ) : isAdditionalProgramsSearching ? (
                // Show search input
                <DropdownMenu
                  isOpen={isAdditionalProgramsOpen}
                  onOpenChange={setIsAdditionalProgramsOpen}
                  trigger={
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search programs..."
                      value={additionalProgramsSearch}
                      onChange={(e) => {
                        setAdditionalProgramsSearch(e.target.value);
                        setIsAdditionalProgramsOpen(true);
                      }}
                      onClick={() => {
                        setIsAdditionalProgramsOpen(true);
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          if (additionalProgramsSearch === '') {
                            setIsAdditionalProgramsSearching(false);
                            setIsAdditionalProgramsOpen(false);
                          }
                        }, 100);
                      }}
                      className="w-full px-4 py-3 border border-panel-border rounded-full bg-input-bg text-text-primary placeholder:text-text-tertiary outline-none transition-all"
                    />
                  }
                >
                  <DropdownMenuContent maxHeight="max-h-64">
                    <DropdownMenuItem
                      selected={formAdditionalPrograms.length === 0}
                      onClick={() => {
                        setFormAdditionalPrograms([]);
                        setIsAdditionalProgramsOpen(false);
                        setAdditionalProgramsSearch('');
                        setIsAdditionalProgramsSearching(false);
                      }}
                    >
                      No programs selected
                    </DropdownMenuItem>
                    {filteredAdditionalPrograms.map((program) => (
                      <DropdownMenuItem
                        key={program}
                        selected={formAdditionalPrograms[0] === program}
                        onClick={() => {
                          setFormAdditionalPrograms([program]);
                          setIsAdditionalProgramsOpen(false);
                          setAdditionalProgramsSearch('');
                          setIsAdditionalProgramsSearching(false);
                        }}
                      >
                        {program}
                      </DropdownMenuItem>
                    ))}
                    {filteredAdditionalPrograms.length === 0 && (
                      <div className="px-3 py-2 text-sm text-text-secondary">No programs found.</div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                // Show select button
                <button
                  type="button"
                  onClick={() => {
                    setIsAdditionalProgramsSearching(true);
                    setIsAdditionalProgramsOpen(true);
                  }}
                  className="w-full px-4 py-3 border border-panel-border rounded-full bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between gap-3 focus:outline-none hover:border-panel-border-strong transition-all"
                >
                  <span className="truncate text-text-tertiary">Select additional programs</span>
                  <Icon name="chevron-down" color="currentColor" width={16} height={16} className="w-4 h-4 shrink-0 text-text-secondary" />
                </button>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">Current Academic Year</label>
              <DropdownMenu
                isOpen={isAcademicYearOpen}
                onOpenChange={setIsAcademicYearOpen}
                trigger={
                  <button className="w-full px-4 py-3 border border-panel-border rounded-full bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between gap-3 focus:outline-none hover:border-panel-border-strong transition-all">
                    <span className={formCurrentAcademicYear ? 'truncate' : 'truncate text-text-tertiary'}>
                      {academicYearOptions.find(o => o.value === formCurrentAcademicYear)?.label ?? 'Select current academic year'}
                    </span>
                    <Icon name="chevron-down" color="currentColor" width={16} height={16} className="w-4 h-4 shrink-0 text-text-secondary" />
                  </button>
                }
              >
                <DropdownMenuContent maxHeight="max-h-64">
                  <DropdownMenuItem
                    selected={formCurrentAcademicYear === ''}
                    onClick={() => {
                      setFormCurrentAcademicYear('');
                      setIsAcademicYearOpen(false);
                    }}
                  >
                    No year selected
                  </DropdownMenuItem>
                  {academicYearOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      selected={formCurrentAcademicYear === option.value}
                      onClick={() => {
                        handleAcademicYearChange(option.value);
                        setIsAcademicYearOpen(false);
                      }}
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">Graduation Year</label>
              <DropdownMenu
                isOpen={isGradYearOpen}
                onOpenChange={setIsGradYearOpen}
                trigger={
                  <button className="w-full px-4 py-3 border border-panel-border rounded-full bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between gap-3 focus:outline-none hover:border-panel-border-strong transition-all">
                    <span className={formGradYear ? 'truncate' : 'truncate text-text-tertiary'}>
                      {gradYearOptions.find(o => o.value === formGradYear)?.label ?? 'Select graduation year'}
                    </span>
                    <Icon name="chevron-down" color="currentColor" width={16} height={16} className="w-4 h-4 shrink-0 text-text-secondary" />
                  </button>
                }
              >
                <DropdownMenuContent maxHeight="max-h-64">
                  <DropdownMenuItem
                    selected={formGradYear === ''}
                    onClick={() => {
                      setFormGradYear('');
                      setIsGradYearOpen(false);
                    }}
                  >
                    No graduation year selected
                  </DropdownMenuItem>
                  {gradYearOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      selected={formGradYear === option.value}
                      onClick={() => {
                        handleGradYearChange(option.value);
                        setIsGradYearOpen(false);
                      }}
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">Bio</label>
              <textarea
                value={formBio}
                onChange={(e) => setFormBio(e.target.value)}
                placeholder="Tell others about yourself..."
                rows={5}
                className="w-full px-4 py-3 border border-panel-border rounded-3xl bg-input-bg text-text-primary outline-none transition-all resize-none"
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
              className="w-full sm:w-auto px-4 py-2 border border-panel-border-strong rounded-full font-semibold text-text-primary hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !hasChanges}
              className={`w-full sm:w-auto px-4 py-2 rounded-full font-semibold transition-colors cursor-pointer ${
                hasChanges
                  ? 'bg-button-bg text-button-text hover:bg-button-hover disabled:opacity-50 disabled:cursor-not-allowed'
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
