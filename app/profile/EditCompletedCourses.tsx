'use client';

import { useState, useEffect } from 'react';
import { getCompletedCourses, addCompletedCourse, deleteCompletedCourse, getPlanBuilderData } from '@/app/actions';

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
  isOpen: boolean;
  onClose: () => void;
  onCoursesChanged?: () => void;
}

export default function EditCompletedCourses({ isOpen, onClose, onCoursesChanged }: EditCompletedCoursesProps) {
  const [courses, setCourses] = useState<CompletedCourse[]>([]);
  const [allCourses, setAllCourses] = useState<CourseOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [title, setTitle] = useState('');
  const [semesterTaken, setSemesterTaken] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadCourses();
      loadAllCourses();
    }
  }, [isOpen]);

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

  const filteredCourses = courseCode.trim()
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
    const result = await addCompletedCourse(courseCode.trim(), title.trim() || undefined, semesterTaken.trim() || undefined);

    if ('error' in result) {
      setError(result.error || 'Failed to add completed course');
      setIsSaving(false);
    } else {
      setCourseCode('');
      setTitle('');
      setSemesterTaken('');
      setShowDropdown(false);
      await loadCourses();
      onCoursesChanged?.();
      setIsSaving(false);
    }
  }

  const handleCourseSelect = (code: string, courseTitle: string | null) => {
    setCourseCode(code);
    setTitle(courseTitle || '');
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

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-panel-bg rounded-2xl border border-panel-border shadow-2xl max-w-2xl w-full max-h-screen overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-panel-bg border-b border-panel-border px-8 py-6 flex justify-between items-center">
            <h2 className="text-2xl font-bold text-heading">Completed Courses</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-text-tertiary hover:text-text-primary transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-8 py-6 space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-red-500 text-sm font-semibold">{error}</p>
              </div>
            )}

            {/* Add Course Form */}
            <div className="border border-panel-border rounded-2xl p-6 bg-panel-bg">
              <h3 className="font-semibold text-heading mb-4 text-base">Add Completed Course</h3>
              <form onSubmit={handleAddCourse} className="space-y-4">
                {/* Course Code with Dropdown */}
                <div className="relative">
                  <label className="block text-sm font-semibold text-text-secondary mb-2">Course Code</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search by code or title (e.g., CS 2100)"
                      value={courseCode}
                      onChange={(e) => setCourseCode(e.target.value)}
                      onFocus={() => setShowDropdown(true)}
                      onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                      className="w-full px-4 py-3 bg-input-bg border border-panel-border rounded-xl text-text-primary outline-none focus:border-uva-blue focus:ring-2 focus:ring-uva-blue/20 transition-all"
                      disabled={isSaving}
                    />
                    {showDropdown && filteredCourses.length > 0 && (
                      <div className="absolute z-10 left-0 top-full w-full mt-1.5 bg-panel-bg border border-panel-border rounded-xl shadow-lg overflow-hidden">
                        <div className="max-h-56 overflow-y-auto p-1.5 space-y-0.5">
                          {filteredCourses.map((course) => (
                            <div
                              key={course.code}
                              className="px-3 py-2.5 rounded-lg hover:bg-hover-bg transition-colors cursor-pointer"
                              onClick={() => handleCourseSelect(course.code, course.title)}
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

                {/* Title and Semester Taken - 2 columns */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-text-secondary mb-2">Title (Auto-filled)</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-4 py-3 bg-input-bg border border-panel-border rounded-xl text-text-primary outline-none focus:border-uva-blue focus:ring-2 focus:ring-uva-blue/20 transition-all"
                      disabled={isSaving}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-text-secondary mb-2">Semester Taken</label>
                    <input
                      type="text"
                      placeholder="e.g., Spring 2024"
                      value={semesterTaken}
                      onChange={(e) => setSemesterTaken(e.target.value)}
                      className="w-full px-4 py-3 bg-input-bg border border-panel-border rounded-xl text-text-primary outline-none focus:border-uva-blue focus:ring-2 focus:ring-uva-blue/20 transition-all"
                      disabled={isSaving}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full px-6 py-3 bg-uva-blue/90 text-white rounded-xl font-semibold hover:bg-uva-blue transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Adding...' : 'Add Course'}
                </button>
              </form>
            </div>

            {/* Courses List */}
            <div>
              <h3 className="font-semibold text-heading mb-3 text-base">Your Completed Courses ({courses.length})</h3>
              {loading ? (
                <p className="text-text-secondary">Loading...</p>
              ) : courses.length === 0 ? (
                <p className="text-text-secondary">No completed courses yet.</p>
              ) : (
                <div className="space-y-2">
                  {courses.map((course) => (
                    <div
                      key={course.id}
                      className="flex items-center justify-between p-4 bg-input-bg border border-panel-border rounded-xl"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-1">
                          <div className="font-semibold text-text-primary">{course.courseCode}</div>
                          {course.semesterTaken && (
                            <div className="text-xs font-medium bg-uva-blue/10 text-uva-blue px-2 py-0.5 rounded-lg whitespace-nowrap">
                              {course.semesterTaken}
                            </div>
                          )}
                        </div>
                        {course.title && <div className="text-sm text-text-secondary">{course.title}</div>}
                      </div>
                      <button
                        onClick={() => handleDeleteCourse(course.id)}
                        disabled={isDeleting === course.id}
                        className="ml-4 px-3 py-1.5 rounded-xl border border-red-400 text-red-500 hover:bg-red-500/10 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                      >
                        {isDeleting === course.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-panel-bg border-t border-panel-border px-8 py-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 border border-panel-border-strong rounded-xl font-semibold text-text-primary hover:bg-hover-bg transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
