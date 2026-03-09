import Link from "next/link";

export default function Forum() {
  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-800 pb-4">
        <h1 className="text-3xl font-bold text-uva-blue dark:text-white">Community Forum</h1>
        <button className="px-4 py-2 bg-uva-orange text-white rounded hover:bg-[#cc6600] font-semibold transition-colors shadow-sm">
          New Post
        </button>
      </div>

      <div className="flex gap-4 mb-6">
        <input 
          type="text" 
          placeholder="Search by major, topic, or tag..." 
          className="flex-1 p-3 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:border-uva-blue focus:ring-uva-blue bg-white dark:bg-black"
        />
        <select className="border-gray-300 dark:border-gray-700 rounded-md p-3 shadow-sm focus:border-uva-blue focus:ring-uva-blue bg-white dark:bg-black">
          <option>All Majors</option>
          <option>Computer Science</option>
          <option>Economics</option>
        </select>
      </div>

      <div className="space-y-4">
        {[1, 2, 3].map((post) => (
          <div key={post} className="bg-white dark:bg-gray-900 border-l-4 border-uva-blue border-y border-r border-gray-200 dark:border-gray-800 p-5 rounded-md hover:shadow-md transition-all cursor-pointer flex gap-4">
            <div className="flex flex-col items-center justify-center min-w-[60px] text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 h-16 w-16 my-auto">
              <span className="font-bold text-lg text-gray-700 dark:text-gray-300">{post * 5}</span>
              <span className="text-[10px] uppercase font-bold text-gray-500">votes</span>
            </div>
            
            <div className="flex-1">
              <h2 className="text-xl font-bold mb-1 text-uva-blue dark:text-gray-100 hover:text-uva-orange transition-colors">
                Is this BSCS schedule too heavy for 3rd year Fall?
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 block">
                Posted by <span className="text-uva-orange font-semibold">User{post}</span> • 2 hours ago • {post} answers
              </p>
              
              <div className="flex gap-2 mt-2">
                <span className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 px-2.5 py-1 rounded text-xs font-semibold">CS</span>
                <span className="bg-orange-50 dark:bg-orange-900/10 text-uva-orange border border-uva-orange/20 px-2.5 py-1 rounded text-xs flex items-center gap-1 font-semibold">
                  📎 Attached Plan
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
