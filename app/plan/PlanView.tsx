'use client';
import { useState } from 'react';
import { generatePreliminaryPlan, addCourseToSemester, removeCourseFromSemester, getCourseInfoFromCSV, getCourseCreditsFromCSV } from '../actions';

interface CourseInfo {
  courseCode: string;
  programs: string[];
  fulfills: string[];
}

export default function PlanView({ userId, plans, allCourses = [] }: { userId: string, plans: any[], allCourses?: string[] }) {
  const activePlan = plans[0]; // Just showing the first plan for MVP
  const [loading, setLoading] = useState(false);
  const [newCourseSem, setNewCourseSem] = useState<string | null>(null);
  const [courseCode, setCourseCode] = useState('');
  const [credits, setCredits] = useState('3');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCourseInfo, setSelectedCourseInfo] = useState<CourseInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);

  const tempFilteredCourses = courseCode 
    ? allCourses.filter(c => c.toLowerCase().includes(courseCode.toLowerCase()))
    : [];
  const filteredCourses = [...tempFilteredCourses.filter(c => c.toLowerCase().slice(0, courseCode.length) == courseCode.toLowerCase()), ...tempFilteredCourses.filter(c => c.toLowerCase().slice(0, courseCode.length) != courseCode.toLowerCase())]

  const handleGenerate = async () => {
    setLoading(true);
    await generatePreliminaryPlan(userId, 'Computer Science (BA)', []);
    setLoading(false);
  };

  const handleCourseSearchChange = (value: string) => {
    setCourseCode(value);
    setShowDropdown(true);
    
    // Attempt exact match first for rapid credit update
    if (allCourses.includes(value)) {
      getCourseCreditsFromCSV(value).then(res => setCredits(res));
    }
  };

  const handleAddCourse = async (semesterId: string) => {
    if (!courseCode) return;
    await addCourseToSemester(semesterId, courseCode, parseInt(credits));
    setNewCourseSem(null);
    setCourseCode('');
  };

  const handleCourseClick = async (code: string) => {
    setLoadingInfo(true);
    const info = await getCourseInfoFromCSV(code);
    setSelectedCourseInfo(info);
    setLoadingInfo(false);
  };

  return (
    <div className="max-w-6xl mx-auto py-8">
      <div className="flex justify-between items-center mb-6 border-b border-panel-border pb-4">
        <h1 className="text-3xl font-bold text-heading">Plan Builder</h1>
        <div className="space-x-3">
          <button className="px-4 py-2 bg-uva-orange text-white rounded hover:bg-[#cc6600] font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed">
            Publish Plan
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="bg-panel-bg-alt border border-panel-border p-6 rounded-lg lg:col-span-1 shadow-sm h-fit">
          <h2 className="font-bold text-xl mb-4 text-heading ">Settings</h2>
          <button 
            onClick={handleGenerate} 
            disabled={loading}
            className="w-full bg-uva-blue flex justify-center text-white py-2.5 rounded font-bold hover:bg-uva-blue-dark transition-colors mt-2 shadow-sm disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? 'Generating...' : 'Auto-Generate CSV Plan'}
          </button>
        </div>

        <div className="lg:col-span-3">
          {!activePlan ? (
             <div className="p-8 text-center text-gray-500">No plan found. Click Auto-Generate to build one from the CSV!</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activePlan.semesters.map((sem: any) => (
                <div key={sem.id} className="bg-panel-bg border border-panel-border rounded-lg p-5 shadow-sm min-h-[150px]">
                  <div className="flex justify-between items-center border-b border-panel-border pb-2 mb-3">
                    <h3 className="font-bold text-lg text-heading ">
                      {sem.termName} {sem.year}
                    </h3>
                    <span className="text-xs font-semibold bg-input-disabled px-2 py-1 rounded text-text-secondary">
                      {sem.courses.reduce((acc: number, c: any) => acc + c.credits, 0)} cr
                    </span>
                  </div>
                  <div className="space-y-2">
                    {sem.courses.map((course: any) => (
                      <div key={course.id} onClick={() => handleCourseClick(course.courseCode)} className="px-3 bg-panel-bg-alt border border-panel-border-strong rounded-md text-sm flex justify-between items-center hover:border-uva-blue transition-colors cursor-pointer group h-[46px]">
                        <span className="font-medium text-text-primary">{course.courseCode}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-500 font-semibold">{course.credits} cr</span>
                          <button onClick={(e) => { e.stopPropagation(); removeCourseFromSemester(course.id); }} className="text-red-500 opacity-0 group-hover:opacity-100 font-bold px-1 transition-opacity cursor-pointer hover:bg-danger-bg-hover rounded">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                    
                    {newCourseSem === sem.id ? (
                      <div className="flex space-x-2 mt-2 relative h-[46px] items-stretch">
                        <div className="w-1/2 relative h-full">
                          <input 
                            type="text" 
                            placeholder="Code..." 
                            value={courseCode} 
                            onChange={e => handleCourseSearchChange(e.target.value)} 
                            onFocus={() => setShowDropdown(true)}
                            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                            className="w-full px-3 border border-panel-border-strong rounded-md text-sm bg-panel-bg text-text-primary focus:outline-none focus:ring-1 focus:ring-uva-blue h-full"
                          />
                          {showDropdown && filteredCourses.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-panel-bg border border-panel-border-strong rounded-md shadow-lg max-h-48 overflow-y-auto">
                              {filteredCourses.map(c => (
                                <div 
                                  key={c} 
                                  className="px-3 py-2 text-sm text-text-primary hover:bg-uva-blue hover:text-white hover:bg-uva-blue transition-colors cursor-pointer"
                                  onClick={() => {
                                    setCourseCode(c);
                                    getCourseCreditsFromCSV(c).then(res => setCredits(res));
                                    setShowDropdown(false);
                                  }}
                                >
                                  {c}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <input 
                          type="number" 
                          placeholder="Cr" 
                          value={credits} 
                          readOnly 
                          className="w-1/4 px-3 border border-panel-border-strong rounded-md text-sm bg-input-disabled text-text-muted cursor-not-allowed focus:outline-none h-full"
                        />
                        <div className="flex items-center space-x-1 px-1">
                          <button onClick={() => handleAddCourse(sem.id)} className="text-success-text hover:text-success-text-hover p-2 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center transition-all hover:scale-110">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><polyline points="20 6 9 17 4 12"/></svg>
                          </button>
                          <button onClick={() => setNewCourseSem(null)} className="text-danger-text hover:text-danger-text-hover p-2 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center transition-all hover:scale-110">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setNewCourseSem(sem.id)} className="mt-2 text-sm font-semibold text-gray-500 hover:text-uva-orange hover:border-uva-orange hover:bg-hover-bg hover:text-uva-orange hover:border-uva-orange w-full text-center px-3 border border-dashed border-panel-border-strong rounded-md transition-all cursor-pointer disabled:cursor-not-allowed h-[46px] flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mr-1"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Course
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {loadingInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-panel-bg p-6 rounded-lg shadow-xl flex items-center space-x-3">
            <svg className="animate-spin h-5 w-5 text-uva-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <span className="font-medium text-text-primary">Loading course info...</span>
          </div>
        </div>
      )}

      {selectedCourseInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedCourseInfo(null)}>
          <div className="bg-panel-bg p-6 rounded-lg shadow-xl max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-2xl font-bold text-heading">{selectedCourseInfo.courseCode}</h2>
              <button onClick={() => setSelectedCourseInfo(null)} className="text-text-muted hover:text-text-secondary cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <div className="space-y-4">
              {selectedCourseInfo.programs.length > 0 && (
                <div>
                  <h3 className="font-semibold text-text-primary mb-2 border-b border-panel-border pb-1">Programs Requirements</h3>
                  <ul className="list-disc list-inside text-sm text-text-secondary space-y-1">
                    {selectedCourseInfo.programs.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedCourseInfo.fulfills.length > 0 && (
                <div>
                  <h3 className="font-semibold text-text-primary mb-2 border-b border-panel-border pb-1">Fulfills Attributes/Reqs</h3>
                  <ul className="list-disc list-inside text-sm text-text-secondary space-y-1">
                    {selectedCourseInfo.fulfills.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedCourseInfo.programs.length === 0 && selectedCourseInfo.fulfills.length === 0 && (
                <p className="text-gray-500 italic text-sm">No specific requirement information found in audit data.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
