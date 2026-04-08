"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { TreeVisualization } from "./TreeVisualization";
import { Icon } from "../components/Icon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "../components/DropdownMenu";
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
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
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
  const filteredDepartments = useMemo(() => {
    return departments
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
  }, [departments, searchText]);

  const handleSelectDepartment = (dept: DepartmentInfo) => {
    setSelectedDepartment(dept);
    setSearchText("");
    setShowDropdown(false);
    setIsSearching(false);
  };

  const handleClearDepartment = () => {
    setSelectedDepartment(null);
    setSearchText("");
    setShowDropdown(false);
    setIsSearching(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Select the first item in the filtered list
      if (filteredDepartments.length > 0) {
        handleSelectDepartment(filteredDepartments[0]);
      } else {
        setShowDropdown(false);
      }
    }
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
              className="w-5 h-5 pb-3 flex items-center justify-center text-text-tertiary hover:text-text-secondary focus:text-text-secondary transition-colors cursor-help"
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
          <DropdownMenu
            isOpen={showDropdown && filteredDepartments.length > 0}
            onOpenChange={setShowDropdown}
            trigger={
              <div className="relative">
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
                  value={selectedDepartment && !isSearching ? selectedDepartment.fullName : searchText}
                  onChange={(e) => {
                    setIsSearching(true);
                    setSearchText(e.target.value);
                    setShowDropdown(true);
                  }}
                  onKeyDown={handleKeyDown}
                  onClick={() => setIsSearching(true)}
                  onBlur={() => {
                    setTimeout(() => {
                      if (!searchText) setIsSearching(false);
                      setShowDropdown(false);
                    }, 100);
                  }}
                  suppressHydrationWarning
                  className="w-full h-[42px] pl-10 pr-10 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-colors"
                />
              </div>
            }
          >
            <DropdownMenuContent maxHeight="max-h-64">
              {filteredDepartments.map((dept) => (
                <DropdownMenuItem
                  key={dept.mnemonic}
                  onClick={() => handleSelectDepartment(dept)}
                  description={dept.mnemonic}
                  selected={selectedDepartment?.mnemonic === dept.mnemonic}
                >
                  {dept.fullName}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
