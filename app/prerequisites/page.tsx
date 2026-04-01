"use client";

import { useState, useEffect, useRef } from "react";
import { TreeVisualization } from "./TreeVisualization";
import { Icon } from "../components/Icon";
import { getCurrentUser } from "../actions";

interface DepartmentInfo {
  mnemonic: string;
  fullName: string;
}

export default function PrerequisitesPage() {
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentInfo | null>(null);
  const [searchText, setSearchText] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isHoveringInfo, setIsHoveringInfo] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);
  const infoButtonRef = useRef<HTMLButtonElement>(null);

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

  // Close info tooltip when clicking outside (mobile only) or when unhover (desktop)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const isClickInsideInfoButton = infoButtonRef.current && infoButtonRef.current.contains(e.target as Node);
      
      if (!isClickInsideInfoButton && !isDesktop) {
        setShowInfoTooltip(false);
      }
    };

    if (showInfoTooltip && !isDesktop) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showInfoTooltip, isDesktop]);

  // Detect if user is on desktop (lg breakpoint and above - matches Sidebar's lg:hidden threshold)
  useEffect(() => {
    const checkIsDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    
    checkIsDesktop();
    window.addEventListener("resize", checkIsDesktop);
    return () => {
      window.removeEventListener("resize", checkIsDesktop);
    };
  }, []);

  // Handle info tooltip visibility based on device
  const handleInfoMouseEnter = () => {
    if (isDesktop) {
      setIsHoveringInfo(true);
      setShowInfoTooltip(true);
    }
  };

  const handleInfoMouseLeave = () => {
    if (isDesktop) {
      setIsHoveringInfo(false);
      setShowInfoTooltip(false);
    }
  };

  const handleInfoClick = () => {
    if (!isDesktop) {
      setShowInfoTooltip(!showInfoTooltip);
    }
  };

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
    <div className="w-full h-full pt-0 flex flex-col min-w-0">
      <div className="mb-6 flex flex-col gap-4 border-b border-panel-border pb-4 w-full min-w-0 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-3xl font-bold text-heading">Prerequisites Tree</h1>
          <div className="relative w-5 h-5 mt-1 flex-shrink-0">
            <button
              ref={infoButtonRef}
              type="button"
              onClick={handleInfoClick}
              onMouseEnter={handleInfoMouseEnter}
              onMouseLeave={handleInfoMouseLeave}
              className="w-5 h-5 flex items-center justify-center text-text-tertiary hover:text-text-secondary focus:text-text-secondary transition-colors cursor-help"
              aria-label="Information about the prerequisites tree"
            >
              <Icon 
                name="info"
                color="currentColor"
                width={20}
                height={20}
              />
            </button>
            {showInfoTooltip && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full w-52 p-2 bg-panel-bg border border-panel-border rounded-lg text-xs text-text-secondary shadow-lg z-50 mt-2">
                This tree only displays courses that have prerequisites or are prerequisites for other courses.
              </div>
            )}
          </div>
        </div>
        <div className="relative w-full lg:flex-1 lg:max-w-xs">
          <span className="sr-only">Search departments</span>
          <Icon
            name="search"
            color="currentColor"
            width={16}
            height={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary"
          />
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
            suppressHydrationWarning
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
        <div className="bg-panel-bg rounded-xl border border-panel-border overflow-hidden flex flex-col h-[calc(100vh-100px)] w-full">
          <div className="flex-1 overflow-hidden min-w-0 min-h-0 relative">
            <TreeVisualization department={selectedDepartment.mnemonic} departmentFullName={selectedDepartment.fullName} />
          </div>
        </div>
      ) : (
        <div className="bg-panel-bg border border-panel-border rounded-xl p-12 text-center">
          <Icon name="grid" color="currentColor" width={48} height={48} className="w-12 h-12 mx-auto mb-4 text-text-muted opacity-50" alt="No" />
          <p className="text-lg font-medium text-heading mb-2">No Department Selected</p>
          <p className="text-sm text-text-secondary">Select a department from the search bar to view its prerequisites tree</p>
        </div>
      )}
    </div>
  );
}
