export default function Profile() {
  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="bg-white dark:bg-gray-900 p-8 rounded-lg shadow-sm border-l-4 border-uva-blue border-y border-r border-gray-200 dark:border-gray-800 mb-8">
        <div className="flex items-center gap-6 mb-6">
          <div className="w-24 h-24 rounded-full bg-uva-orange flex items-center justify-center text-white text-3xl font-bold shadow-md">
            U
          </div>
          <div>
            <h1 className="text-3xl font-bold mb-1 text-uva-blue dark:text-gray-100">Hi, Mock User</h1>
            <p className="text-gray-600 dark:text-gray-400 text-lg font-medium">Computer Science (BA) • Class of 2026</p>
          </div>
        </div>

        <div className="flex gap-4">
          <button className="bg-uva-blue text-white px-5 py-2.5 rounded hover:bg-uva-blue-dark font-bold shadow-sm transition-colors">
            Edit Profile
          </button>
          <button className="border-2 border-dashed border-gray-300 dark:border-gray-600 px-5 py-2.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold transition-colors">
            Upload Previous Classes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-sm border-t-4 border-uva-orange border-x border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-xl font-bold mb-5 text-uva-blue dark:text-gray-200">Activity Stats</h2>
          <div className="space-y-4">
            <div className="flex justify-between border-b pb-3 border-gray-100 dark:border-gray-800">
              <span className="text-gray-600 dark:text-gray-400 font-medium">Plans Created</span>
              <span className="font-bold text-gray-800 dark:text-gray-200">1</span>
            </div>
            <div className="flex justify-between border-b pb-3 border-gray-100 dark:border-gray-800">
              <span className="text-gray-600 dark:text-gray-400 font-medium">Plans Published</span>
              <span className="font-bold text-gray-800 dark:text-gray-200">0</span>
            </div>
            <div className="flex justify-between border-b pb-3 border-gray-100 dark:border-gray-800">
              <span className="text-gray-600 dark:text-gray-400 font-medium">Forum Posts</span>
              <span className="font-bold text-gray-800 dark:text-gray-200">3</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-sm border-t-4 border-uva-blue border-x border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-xl font-bold mb-5 text-uva-blue dark:text-gray-200">Badges</h2>
          <div className="flex gap-3 flex-wrap">
            <div className="bg-orange-50 dark:bg-orange-900/20 text-uva-orange px-3 py-2 rounded-md flex items-center gap-2 text-sm font-bold border border-uva-orange/30 shadow-sm">
              <span>⭐</span> Early Adopter
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 text-uva-blue dark:text-blue-300 px-3 py-2 rounded-md flex items-center gap-2 text-sm font-bold border border-uva-blue/20 shadow-sm">
              <span>🗣️</span> Active Participant
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 text-gray-500 px-3 py-2 rounded-md text-sm border-2 border-gray-200 dark:border-gray-700 border-dashed font-semibold cursor-pointer hover:border-uva-orange hover:text-uva-orange transition-colors">
              + Earn more badges
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
