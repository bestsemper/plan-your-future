"use client";
import { useState } from "react";
import Link from "next/link";

export default function Forum() {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedMajor, setSelectedMajor] = useState("All Majors");
  
  const majors = ["All Majors", "Computer Science", "Economics"];

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="flex justify-between items-center mb-6 border-b border-panel-border pb-4">
        <h1 className="text-3xl font-bold text-heading">Community Forum</h1>
        <button className="px-4 py-2 bg-uva-orange text-white rounded hover:bg-[#cc6600] font-semibold transition-colors cursor-pointer">
          New Post
        </button>
      </div>

      <div className="flex gap-4 mb-6 relative">
        <input 
          type="text" 
          placeholder="Search by major, topic, or tag..." 
          className="flex-1 p-3 border border-panel-border rounded-md focus:border-uva-blue focus:ring-uva-blue bg-input-bg"
        />
        
        <div className="relative">
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="h-full border border-panel-border rounded-md px-4 py-3 hover:border-uva-blue focus:border-uva-blue focus:ring-1 focus:ring-uva-blue bg-input-bg cursor-pointer flex items-center justify-between min-w-[200px]"
          >
            <span>{selectedMajor}</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 ml-2 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}>
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>
          
          {isDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-full bg-panel-bg border border-panel-border rounded-md z-10 overflow-hidden">
              {majors.map((major) => (
                <div 
                  key={major}
                  onClick={() => {
                    setSelectedMajor(major);
                    setIsDropdownOpen(false);
                  }}
                  className={`px-4 py-3 cursor-pointer hover:bg-hover-bg transition-colors ${selectedMajor === major ? 'bg-uva-blue/5 text-uva-blue font-medium' : 'text-text-primary'}`}
                >
                  {major}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {[1, 2, 3].map((post) => (
          <div key={post} className="bg-panel-bg border border-panel-border p-5 rounded-md transition-all cursor-pointer flex gap-4">
            <div className="flex flex-col items-center justify-center min-w-[60px] text-gray-500 bg-panel-bg-alt rounded-md border border-panel-border h-16 w-16 my-auto">
              <span className="font-bold text-lg text-text-secondary">{post * 5}</span>
              <span className="text-[10px] uppercase font-bold text-gray-500">votes</span>
            </div>
            
            <div className="flex-1">
              <h2 className="text-xl font-bold mb-1 text-heading hover:text-uva-orange transition-colors">
                Is this BSCS schedule too heavy for 3rd year Fall?
              </h2>
              <p className="text-sm text-text-secondary mb-3 block">
                Posted by <span className="text-uva-orange font-semibold">User{post}</span> • 2 hours ago • {post} answers
              </p>
              
              <div className="flex gap-2 mt-2">
                <span className="bg-panel-bg-alt border border-panel-border text-text-secondary px-2.5 py-1 rounded text-xs font-semibold">CS</span>
                <span className="bg-badge-orange-bg text-uva-orange border border-uva-orange px-2.5 py-1 rounded text-xs flex items-center gap-1 font-semibold">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> Attached Plan
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
