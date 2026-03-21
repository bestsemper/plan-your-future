"use client";

import { useState, useEffect, useRef } from "react";
import { TreeVisualization } from "@/app/components/TreeVisualization";
import { getCurrentUser } from "@/app/actions";

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

  // Fetch departments on mount and auto-select user's major
  useEffect(() => {
    async function fetchDepartmentsAndMajor() {
      const res = await fetch("/api/tree/departments");
      const depts: DepartmentInfo[] = await res.json();
      setDepartments(depts);
      
      // Get current user and auto-select their major if set
      const user = await getCurrentUser();
      if (user && user.major && user.major !== "Undeclared") {
        // Find department matching the major by mnemonic or full name
        const userMajorLower = user.major.toLowerCase();
        // First try to find exact mnemonic match, or if the major name includes the full department name
        const matchingDept = depts.find(
          dept => userMajorLower === dept.mnemonic.toLowerCase() ||
                  userMajorLower.includes(dept.fullName.toLowerCase())
        );
        if (matchingDept) {
          setSelectedDepartment(matchingDept);
        }
      }
    }
    fetchDepartmentsAndMajor();
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
  const filteredDepartments = departments
    .filter(
      (dept) =>
        dept.fullName.toLowerCase().includes(searchText.toLowerCase()) ||
        dept.mnemonic.toLowerCase().includes(searchText.toLowerCase())
    )
    .sort((a, b) => {
      const lowerSearch = searchText.toLowerCase();
      const aStartsFullName = a.fullName.toLowerCase().startsWith(lowerSearch);
      const bStartsFullName = b.fullName.toLowerCase().startsWith(lowerSearch);
      const aStartsMnemonic = a.mnemonic.toLowerCase().startsWith(lowerSearch);
      const bStartsMnemonic = b.mnemonic.toLowerCase().startsWith(lowerSearch);

      // Prioritize prefix matches on mnemonic first, then fullName
      if (aStartsMnemonic && !bStartsMnemonic) return -1;
      if (!aStartsMnemonic && bStartsMnemonic) return 1;
      if (aStartsFullName && !bStartsFullName) return -1;
      if (!aStartsFullName && bStartsFullName) return 1;

      return a.mnemonic.localeCompare(b.mnemonic);
    });

  const handleSelectDepartment = (dept: DepartmentInfo) => {
    setSelectedDepartment(dept);
    setSearchText("");
    setShowDropdown(false);
  };



  return (
    <div className="w-full pt-0 pb-6">
      <div className="mb-6 flex items-center justify-between gap-3 border-b border-panel-border pb-4">
        <h1 className="text-3xl font-bold text-heading">Prerequisite Tree</h1>
        <div className="relative flex-1 max-w-xs">
          <span className="sr-only">Search departments</span>
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M8.5 3a5.5 5.5 0 014.396 8.804l3.65 3.65a.75.75 0 11-1.06 1.06l-3.65-3.65A5.5 5.5 0 118.5 3zm0 1.5a4 4 0 100 8 4 4 0 000-8z"
              clipRule="evenodd"
            />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search departments..."
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            className="w-full h-[42px] pl-10 pr-4 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none focus:border-uva-blue/40 focus:ring-2 focus:ring-uva-blue/15"
          />
          
          {showDropdown && filteredDepartments.length > 0 && (
            <div
              ref={dropdownContainerRef}
              className="absolute left-0 right-0 mt-2 z-30 rounded-xl border border-panel-border bg-panel-bg shadow-lg overflow-hidden"
            >
              <div className="max-h-64 overflow-y-auto">
                {filteredDepartments.map((dept) => (
                  <button
                    key={dept.mnemonic}
                    onClick={() => handleSelectDepartment(dept)}
                    className={`block w-full text-left px-4 py-3 border-b border-panel-border last:border-b-0 hover:bg-hover-bg transition-colors ${
                      selectedDepartment?.mnemonic === dept.mnemonic
                        ? "bg-badge-blue-bg text-badge-blue-text font-medium"
                        : "text-text-primary"
                    }`}
                  >
                    <p className="text-sm font-semibold line-clamp-1">{dept.fullName}</p>
                    <p className="text-xs text-text-secondary mt-0.5">{dept.mnemonic}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedDepartment ? (
        <div className="bg-panel-bg rounded-xl border border-panel-border overflow-hidden flex flex-col h-[calc(100vh-200px)]">
          <div className="flex-1 overflow-auto">
            <TreeVisualization department={selectedDepartment.mnemonic} departmentFullName={selectedDepartment.fullName} />
          </div>
        </div>
      ) : (
        <div className="bg-panel-bg border border-panel-border rounded-xl p-12 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 mx-auto mb-4 text-text-muted opacity-50">
            <path d="M12 2v20M2 12h20"/>
          </svg>
          <p className="text-lg font-medium text-heading mb-2">No Department Selected</p>
          <p className="text-sm text-text-secondary">Select a department from the search bar to view its prerequisite tree</p>
        </div>
      )}
    </div>
  );
}
