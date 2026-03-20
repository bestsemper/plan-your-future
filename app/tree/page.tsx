"use client";

import { useState, useEffect, useRef } from "react";
import { TreeVisualization } from "@/app/components/TreeVisualization";

interface DepartmentInfo {
  mnemonic: string;
  fullName: string;
}

export default function TreePage() {
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentInfo | null>(null);
  const [searchText, setSearchText] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);

  // Fetch departments on mount
  useEffect(() => {
    async function fetchDepartments() {
      const res = await fetch("/api/tree/departments");
      const depts: DepartmentInfo[] = await res.json();
      setDepartments(depts);
      const csDept = depts.find((d) => d.mnemonic === "CS");
      if (csDept) {
        setSelectedDepartment(csDept);
      } else if (depts.length > 0) {
        setSelectedDepartment(depts[0]);
      }
    }
    fetchDepartments();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const isClickInsideInput = searchInputRef.current && searchInputRef.current.contains(e.target as Node);
      const isClickInsideDropdown = dropdownContainerRef.current && dropdownContainerRef.current.contains(e.target as Node);
      
      if (!isClickInsideInput && !isClickInsideDropdown) {
        setShowDropdown(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Filter departments based on search text
  const filteredDepartments = departments.filter(
    (dept) =>
      dept.fullName.toLowerCase().includes(searchText.toLowerCase()) ||
      dept.mnemonic.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleSelectDepartment = (dept: DepartmentInfo) => {
    setSelectedDepartment(dept);
    setSearchText("");
    setShowDropdown(false);
  };



  return (
    <div className="flex-1 flex flex-col p-6 bg-white min-h-screen">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            className="text-blue-600"
          >
            <circle cx="12" cy="5" r="2" strokeWidth="2" />
            <circle cx="5" cy="14" r="2" strokeWidth="2" />
            <circle cx="19" cy="14" r="2" strokeWidth="2" />
            <circle cx="12" cy="22" r="2" strokeWidth="2" />
            <line x1="12" y1="7" x2="12" y2="11" strokeWidth="2" />
            <line x1="12" y1="16" x2="12" y2="20" strokeWidth="2" />
            <line x1="11" y1="13" x2="6" y2="13" strokeWidth="2" />
            <line x1="13" y1="13" x2="18" y2="13" strokeWidth="2" />
          </svg>
          <h1 className="text-3xl font-bold text-gray-900">
            Prerequisite Tree
          </h1>
        </div>

        <div className="mb-6">
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            Search for a different department:
          </label>
          <div className="relative w-80">
            <svg
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Type name or code..."
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {showDropdown && filteredDepartments.length > 0 && (
              <div
                ref={dropdownContainerRef}
                className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-64 overflow-y-auto"
              >
                {filteredDepartments.map((dept) => (
                  <button
                    key={dept.mnemonic}
                    onClick={() => handleSelectDepartment(dept)}
                    className="w-full text-left px-3 py-2 hover:bg-blue-100 focus:bg-blue-100 focus:outline-none text-gray-900"
                  >
                    <div className="font-medium">{dept.fullName}</div>
                    <div className="text-sm text-gray-600">{dept.mnemonic}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedDepartment && (
        <div className="flex-1 flex flex-col overflow-auto">
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-gray-900">
              {selectedDepartment.fullName}
            </h2>
            <p className="text-sm text-gray-600">
              {selectedDepartment.mnemonic}
            </p>
          </div>
          <div className="flex-1 overflow-auto">
            <TreeVisualization department={selectedDepartment.mnemonic} />
          </div>
        </div>
      )}
    </div>
  );
}
