import Link from 'next/link';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-lg shadow-md border-t-8 border-uva-blue p-8 text-center border-x border-b border-gray-200 dark:border-gray-800">
        <div className="mb-6">
          <div className="w-16 h-16 bg-uva-orange text-white text-2xl font-bold rounded-full flex items-center justify-center mx-auto shadow-sm mb-4">
            U
          </div>
          <h1 className="text-3xl font-bold text-uva-blue dark:text-gray-100">NetBadge Sign In</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2 text-sm font-medium">
            Log in to access your Hoos Plan account.
          </p>
        </div>

        <div className="space-y-4 text-left border-y border-gray-100 dark:border-gray-800 py-6 mb-6">
          <p className="text-sm text-uva-orange font-bold text-center block mb-2">
            (Mock NetBadge Authorization)
          </p>
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Computing ID</label>
            <input 
              type="text" 
              placeholder="e.g. mst3k" 
              defaultValue="wahoo99"
              className="w-full p-3 border border-gray-300 dark:border-gray-700 rounded-md focus:border-uva-blue focus:ring-uva-blue bg-white dark:bg-black text-gray-800 dark:text-gray-200 shadow-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Password</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              defaultValue="mockpassword"
              className="w-full p-3 border border-gray-300 dark:border-gray-700 rounded-md focus:border-uva-blue focus:ring-uva-blue bg-white dark:bg-black text-gray-800 dark:text-gray-200 shadow-sm"
            />
          </div>
        </div>

        <Link href="/">
          <button className="w-full bg-uva-blue hover:bg-uva-blue-dark text-white font-bold py-3 rounded-md shadow-sm transition-colors text-lg">
            Sign In with NetBadge
          </button>
        </Link>
      </div>
      
      <p className="mt-8 text-sm font-medium text-gray-500 dark:text-gray-500">
        This is a mock application. Do not enter real credentials.
      </p>
    </div>
  );
}