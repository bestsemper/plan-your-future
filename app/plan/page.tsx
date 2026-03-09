export default function PlanBuilder() {
  return (
    <div className="max-w-6xl mx-auto py-8">
      <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-800 pb-4">
        <h1 className="text-3xl font-bold text-uva-blue dark:text-white">Plan Builder</h1>
        <div className="space-x-3">
          <button className="px-4 py-2 border-2 border-uva-blue text-uva-blue dark:border-gray-600 dark:text-white rounded hover:bg-gray-50 dark:hover:bg-gray-800 font-semibold transition-colors">
            Save Plan
          </button>
          <button className="px-4 py-2 bg-uva-orange text-white rounded hover:bg-[#cc6600] font-semibold transition-colors">
            Publish Plan
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Top Controls / Left Settings Panel MVP */}
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-6 rounded-lg lg:col-span-1 shadow-sm">
          <h2 className="font-bold text-xl mb-4 text-uva-blue dark:text-gray-200">Settings</h2>
          
          <div className="mb-5">
            <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Major</label>
            <select className="w-full border-gray-300 dark:border-gray-700 rounded-md shadow-sm p-2.5 bg-white dark:bg-black focus:border-uva-blue focus:ring-uva-blue">
              <option>Computer Science (BA)</option>
              <option>Computer Science (BS)</option>
              <option>Economics</option>
            </select>
          </div>

          <div className="mb-6 space-y-3">
            <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300">Goals</h3>
            <label className="flex items-center space-x-3 text-sm">
              <input type="checkbox" className="rounded text-uva-orange focus:ring-uva-orange" />
              <span>Study Abroad</span>
            </label>
            <label className="flex items-center space-x-3 text-sm">
              <input type="checkbox" className="rounded text-uva-orange focus:ring-uva-orange" />
              <span>Double Major</span>
            </label>
            <label className="flex items-center space-x-3 text-sm">
              <input type="checkbox" className="rounded text-uva-orange focus:ring-uva-orange" />
              <span>Early Graduation</span>
            </label>
          </div>

          <button className="w-full bg-uva-blue text-white py-2.5 rounded font-bold hover:bg-uva-blue-dark transition-colors mt-2 shadow-sm">
            Generate Plan
          </button>
        </div>

        {/* Main Semesters Area */}
        <div className="lg:col-span-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
              <div key={sem} className="bg-white dark:bg-gray-800 border-t-4 border-uva-blue border-x border-b border-gray-200 dark:border-gray-700 rounded-lg p-5 shadow-sm">
                <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-2 mb-3">
                  <h3 className="font-bold text-lg text-uva-blue dark:text-gray-200">
                    Semester {sem}
                  </h3>
                  <span className="text-xs font-semibold bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300">15 cr</span>
                </div>
                <div className="space-y-2">
                  <div className="p-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-md text-sm flex justify-between items-center hover:border-uva-orange transition-colors cursor-pointer">
                    <span className="font-medium text-gray-800 dark:text-gray-200">CS 1110 - Intro to Programming</span>
                    <span className="text-gray-500 font-semibold">3 cr</span>
                  </div>
                  <button className="text-sm font-semibold text-gray-500 hover:text-uva-orange hover:border-uva-orange hover:bg-orange-50 dark:hover:bg-gray-700 w-full text-center p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md transition-all">
                    + Add Course
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
