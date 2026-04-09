'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { getCompletedCourses, addCompletedCourse, deleteCompletedCourse, getPlanBuilderData, importCompletedCoursesFromAuditPdf } from '@/app/actions';
import { Icon } from '@/app/components/Icon';

interface CompletedCourse {
  id: string;
  courseCode: string;
  title: string | null;
  sourceType: string;
  semesterTaken: string | null;
}

interface CourseOption {
  code: string;
  title: string | null;
}

interface EditCompletedCoursesProps {
  isOpen?: boolean;
  onClose?: () => void;
  onCoursesChanged?: () => void;
}

type CourseListCategory = 'transfer' | 'extra' | 'taken';

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

export default function EditCompletedCourses({ isOpen, onClose, onCoursesChanged }: EditCompletedCoursesProps) {
  const searchParams = useSearchParams();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [courses, setCourses] = useState<CompletedCourse[]>([]);
  const [allCourses, setAllCourses] = useState<CourseOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [showTransfer, setShowTransfer] = useState(true);
  const [showExtra, setShowExtra] = useState(true);
  const [showTaken, setShowTaken] = useState(false);

  const getCurrentSemesterRank = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed

    let termOrder = 1; // Spring
    if (month <= 1) {
      termOrder = 0; // Winter
    } else if (month >= 2 && month <= 4) {
      termOrder = 1; // Spring
    } else if (month >= 5 && month <= 7) {
      termOrder = 2; // Summer
    } else {
      termOrder = 3; // Fall
    }

    return year * 10 + termOrder;
  };

  const parseSemesterRank = (semesterTaken: string | null): number | null => {
    if (!semesterTaken) return null;
    const match = semesterTaken.match(/^(Fall|Winter|Spring|Summer)\s+(\d{4})$/i);
    if (!match) return null;

    const year = Number.parseInt(match[2], 10);
    const term = match[1].toLowerCase();
    const order = term === 'winter' ? 0 : term === 'spring' ? 1 : term === 'summer' ? 2 : 3;
    return year * 10 + order;
  };

  const classifyCourse = (course: CompletedCourse): CourseListCategory => {
    const sourceType = (course.sourceType || '').toLowerCase();
    if (sourceType.includes('transfer') || sourceType.includes('unmatched') || /\b\d{4}t\b/.test(course.courseCode.toLowerCase())) {
      return 'transfer';
    }
    if (sourceType.includes('manual_extra') || sourceType === 'manual') {
      return 'extra';
    }
    return 'taken';
  };

  const filteredListedCourses = useMemo(() => {
    return courses.filter((course) => {
      const category = classifyCourse(course);
      if (category === 'transfer') return showTransfer;
      if (category === 'extra') return showExtra;
      return showTaken;
    });
  }, [courses, showTransfer, showExtra, showTaken]);

  const modalIsOpen = typeof isOpen === 'boolean' ? isOpen : internalIsOpen;

  const emitTutorialEvent = (name: string) => {
    if (typeof window === 'undefined') {
      return;
    }

    window.dispatchEvent(new CustomEvent('tutorial:step-event', { detail: { name } }));
  };

  const closeModal = () => {
    if (typeof isOpen === 'boolean') {
      onClose?.();
      return;
    }
    setInternalIsOpen(false);
  };

  useEffect(() => {
    if (modalIsOpen) {
      loadCourses();
      loadAllCourses();
      emitTutorialEvent('auditModalOpened');
    }
  }, [modalIsOpen]);

  useEffect(() => {
    if (typeof isOpen === 'boolean') {
      return;
    }

    if (searchParams.get('tutorialAction') !== 'openAuditModal') {
      return;
    }

    setInternalIsOpen(true);
  }, [isOpen, searchParams]);

  useEffect(() => {
    if (!importFile) {
      return;
    }

    emitTutorialEvent('auditFileSelected');
  }, [importFile]);

  useEffect(() => {
    const onClosePopups = () => setInternalIsOpen(false);
    window.addEventListener("tutorial:close-popups", onClosePopups);
    return () => window.removeEventListener("tutorial:close-popups", onClosePopups);
  }, []);

  async function loadAllCourses() {
    try {
      const res = await getPlanBuilderData();
      if ('allCourses' in res && res.allCourses) {
        setAllCourses(res.allCourses);
      }
    } catch (err) {
      console.error('Error loading courses:', err);
    }
  }

  const filteredCourseOptions = courseCode.trim()
    ? allCourses
        .filter((course) =>
          course.code.toLowerCase().includes(courseCode.toLowerCase()) ||
          (course.title ?? '').toLowerCase().includes(courseCode.toLowerCase())
        )
        .sort((a, b) => {
          const lowerSearch = courseCode.toLowerCase();
          const aStartsWith = a.code.toLowerCase().startsWith(lowerSearch);
          const bStartsWith = b.code.toLowerCase().startsWith(lowerSearch);
          if (aStartsWith && !bStartsWith) return -1;
          if (!aStartsWith && bStartsWith) return 1;
          return a.code.localeCompare(b.code);
        })
    : [];

  const handleCourseSearchChange = (value: string) => {
    setCourseCode(value);
    setShowDropdown(true);
  };

  async function loadCourses() {
    setLoading(true);
    setError('');
    const result = await getCompletedCourses();
    if ('error' in result) {
      setError(result.error || 'Failed to load completed courses');
    } else {
      setCourses(result.courses || []);
    }
    setLoading(false);
  }

  async function handleAddCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!courseCode.trim()) {
      setError('Course code is required');
      return;
    }

    setIsSaving(true);
    setError('');
    const result = await addCompletedCourse(courseCode.trim());

    if ('error' in result) {
      setError(result.error || 'Failed to add completed course');
      setIsSaving(false);
    } else {
      setCourseCode('');
      setShowDropdown(false);
      await loadCourses();
      onCoursesChanged?.();
      setIsSaving(false);
    }
  }

  const handleCourseSelect = (code: string) => {
    setCourseCode(code);
    setShowDropdown(false);
  }

  async function handleDeleteCourse(courseId: string) {
    if (!confirm('Are you sure you want to delete this course?')) {
      return;
    }

    setIsDeleting(courseId);
    setError('');
    const result = await deleteCompletedCourse(courseId);

    if ('error' in result) {
      setError(result.error || 'Failed to delete completed course');
      setIsDeleting(null);
    } else {
      await loadCourses();
      onCoursesChanged?.();
      setIsDeleting(null);
    }
  }

  async function handleImportFromAuditPdf() {
    if (!importFile) {
      setError('Please choose an audit report PDF.');
      return;
    }

    setIsImporting(true);
    setError('');
    try {
      const dataUrl = await fileToDataUrl(importFile);
      const result = await importCompletedCoursesFromAuditPdf({ pdfBase64: dataUrl });

      if ('error' in result) {
        setError(result.error || 'Failed to import from audit report.');
        setIsImporting(false);
        return;
      }

      setImportFile(null);
      await loadCourses();
      onCoursesChanged?.();
      emitTutorialEvent('auditImportCompleted');
      setIsImporting(false);
    } catch {
      setError('Unable to read PDF file.');
      setIsImporting(false);
    }
  }

  if (!modalIsOpen) {
    if (typeof isOpen === 'boolean') {
      return null;
    }

    return (
      <button
        onClick={() => setInternalIsOpen(true)}
        data-tutorial-target="open-completed-courses"
        className="w-full sm:w-auto border border-dashed border-panel-border-strong px-5 py-2.5 rounded-xl hover:bg-hover-bg text-text-primary font-semibold transition-colors cursor-pointer"
      >
        Completed Courses
      </button>
    );
  }

  return (
    <div className="fixed z-50 flex items-center justify-center lg:inset-0 lg:bg-black/50 lg:p-4 max-lg:inset-x-0 max-lg:top-14 max-lg:bottom-0 max-lg:pt-0 max-lg:p-3" onClick={closeModal}>
      <div 
        className="bg-panel-bg rounded-2xl border border-panel-border shadow-xl max-lg:shadow-none max-w-2xl w-full max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col max-lg:rounded-3xl max-lg:max-w-none max-lg:h-full max-lg:max-h-none"
        onClick={(e) => e.stopPropagation()}
      >
          {/* Header */}
          <div className="bg-panel-bg border-b border-panel-border px-8 py-6 flex justify-between items-center">
            <h2 className="text-2xl font-bold text-heading">Completed Courses</h2>
            <button
              type="button"
              onClick={closeModal}
              className="text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
              aria-label="Close"
            >
              <Icon name="x" color="currentColor" width={24} height={24} className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="px-8 py-6 space-y-6 overflow-y-auto">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-red-500 text-sm font-semibold">{error}</p>
              </div>
            )}

            <div className="border border-panel-border rounded-2xl p-6 bg-panel-bg space-y-3" data-tutorial-target="audit-import-container">
              <h3 className="font-semibold text-heading text-base">Import Audit Report</h3>
              <p className="text-sm text-text-secondary">
                Open Stellic → Plan your Path → Print Audit Report → Create audit report
              </p>
              <input
                type="file"
                accept="application/pdf"
                data-tutorial-target="audit-import-file"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-text-primary file:mr-3 file:px-3 file:py-2 file:border file:border-panel-border-strong file:rounded file:bg-panel-bg-alt file:text-text-primary file:cursor-pointer"
              />
              <button
                type="button"
                data-tutorial-target="audit-import-submit"
                onClick={() => void handleImportFromAuditPdf()}
                disabled={isImporting}
                className="w-full px-6 py-3 bg-button-bg text-button-text rounded-xl font-semibold hover:bg-button-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isImporting ? 'Importing...' : 'Import Audit Report'}
              </button>
            </div>

            {/* Add Course Form */}
            <div className="border border-panel-border rounded-2xl p-6 bg-panel-bg">
              <h3 className="font-semibold text-heading mb-4 text-base">Add Extra Course</h3>
              <p className="text-sm text-text-secondary mb-4">
                Use this only for extra courses not shown in your audit report (e.g. courses from placement or skip tests).
              </p>
              <form onSubmit={handleAddCourse} className="space-y-4">
                {/* Course Code with Dropdown */}
                <div className="relative">
                  <label className="block text-sm font-semibold text-text-secondary mb-2">Course Code</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search by code or title (e.g., CS 2100)"
                      value={courseCode}
                      onChange={(e) => handleCourseSearchChange(e.target.value)}
                      onFocus={() => setShowDropdown(true)}
                      onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                      className="w-full px-4 py-3 bg-input-bg border border-panel-border rounded-xl text-text-primary outline-none focus:border-white focus:ring-2 focus:ring-white/20 transition-all"
                      disabled={isSaving}
                    />
                    {showDropdown && filteredCourseOptions.length > 0 && (
                      <div className="absolute z-10 left-0 top-full w-full mt-1.5 bg-panel-bg border border-panel-border rounded-xl shadow-lg overflow-hidden">
                        <div className="max-h-56 overflow-y-auto p-1.5 space-y-0.5">
                          {filteredCourseOptions.map((course) => (
                            <div
                              key={course.code}
                              className="px-3 py-2.5 rounded-lg hover:bg-hover-bg transition-colors cursor-pointer"
                              onClick={() => handleCourseSelect(course.code)}
                            >
                              <div className="text-sm font-medium text-text-primary">{course.code}</div>
                              {course.title && (
                                <div className="text-xs text-text-secondary truncate">{course.title}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full px-6 py-3 bg-button-bg text-button-text rounded-xl font-semibold hover:bg-button-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Adding...' : 'Add Course'}
                </button>
              </form>
            </div>

            {/* Courses List */}
            <div>
              <h3 className="font-semibold text-heading mb-3 text-base">Your Completed Courses ({filteredListedCourses.length}/{courses.length})</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setShowTransfer((prev) => !prev)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${showTransfer ? 'bg-hover-bg text-text-primary border-panel-border-strong' : 'border-panel-border-strong text-text-secondary hover:bg-hover-bg'}`}
                >
                  Transfer
                </button>
                <button
                  type="button"
                  onClick={() => setShowExtra((prev) => !prev)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${showExtra ? 'bg-hover-bg text-text-primary border-panel-border-strong' : 'border-panel-border-strong text-text-secondary hover:bg-hover-bg'}`}
                >
                  Extra
                </button>
                <button
                  type="button"
                  onClick={() => setShowTaken((prev) => !prev)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${showTaken ? 'bg-hover-bg text-text-primary border-panel-border-strong' : 'border-panel-border-strong text-text-secondary hover:bg-hover-bg'}`}
                >
                  Taken
                </button>
              </div>
              {loading ? (
                <p className="text-text-secondary">Loading...</p>
              ) : courses.length === 0 ? (
                <p className="text-text-secondary">No completed courses yet.</p>
              ) : filteredListedCourses.length === 0 ? (
                <p className="text-text-secondary">No courses match the selected filters.</p>
              ) : (
                <div className="space-y-2">
                  {filteredListedCourses.map((course) => (
                    <div
                      key={course.id}
                      className="flex items-center justify-between px-4 py-3 bg-input-bg border border-panel-border rounded-xl"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <div className="font-semibold text-text-primary">{course.courseCode}</div>
                          {course.semesterTaken && (
                            <div className="text-xs font-medium bg-badge-blue-bg text-badge-blue-text px-2 py-0.5 rounded-lg whitespace-nowrap">
                              {course.semesterTaken}
                            </div>
                          )}
                        </div>
                        {course.title && <div className="text-sm text-text-secondary">{course.title}</div>}
                      </div>
                      <button
                        onClick={() => handleDeleteCourse(course.id)}
                        disabled={isDeleting === course.id}
                        className="ml-3 px-2.5 py-1.5 rounded-xl border border-red-400 text-red-500 hover:bg-red-500/10 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                      >
                        {isDeleting === course.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
      </div>
    </div>
  );
}
