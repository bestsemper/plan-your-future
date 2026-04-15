"use client";

import { useState } from 'react';
import type { RequirementCheckResult } from '../utils/requirementsValidator';
import { Icon } from './Icon';
import './RequirementsSidebar.css';

interface RequirementsSidebarProps {
  requirements: RequirementCheckResult | null;
  isOpen: boolean;
  onClose: () => void;
  programName: string;
  isLoading?: boolean;
}

function RequirementItem({ result, level = 0 }: { result: RequirementCheckResult; level?: number }) {
  const hasChildren = result.matchedChildren.length > 0;
  const hasMatchedCourses = result.matchedCourses && result.matchedCourses.length > 0;
  const hasSuggestions = !result.satisfied && result.courseSuggestions && result.courseSuggestions.length > 0;
  
  // Check if this is a leaf course requirement (no children, name looks like a course code)
  const isLeafCourseRequirement = !hasChildren && /^[A-Z]+ \d{4}/.test(result.requirement.name);
  
  const shouldShow = hasChildren || hasMatchedCourses || hasSuggestions || isLeafCourseRequirement;
  
  // Debug logging for HSS
  const isHSS = /HSS/i.test(result.requirement.name) || /Humanities|Social.*Sciences/.test(result.requirement.name);
  if (isHSS) {
    console.log(`[SIDEBAR DEBUG] HSS requirement: "${result.requirement.name}"`);
    console.log(`  hasChildren: ${hasChildren}, hasMatchedCourses: ${hasMatchedCourses}`);
    console.log(`  courseSuggestions: ${result.courseSuggestions?.length || 0}, satisfied: ${result.satisfied}`);
    console.log(`  hasSuggestions: ${hasSuggestions}, shouldShow: ${shouldShow}`);
  }
  
  // Auto-expand: first 2 levels, or if unsatisfied with suggestions
  const [expanded, setExpanded] = useState(level < 2 || hasSuggestions);
  
  // Don't render if this requirement has no matches and no suggestions and no children
  if (!shouldShow && level > 0) {
    return null;
  }
  
  // Show expand button if there are children OR suggestions
  const canExpand = hasChildren || hasSuggestions;
  
  // Determine status icon
  // For parent nodes: use percentage to determine status (don't show ✓ unless ALL are satisfied)
  // For leaf nodes: use satisfied boolean
  let statusIcon: React.ReactNode;
  const isComplete = hasChildren ? (result.percentage === 1) : (result.satisfied && result.percentage === 1);
  const isPartial = result.percentage > 0 && result.percentage < 1;
  
  if (isComplete) {
    statusIcon = <div className="req-status req-status-complete">✓</div>;
  } else if (isPartial) {
    statusIcon = <div className="req-status req-status-partial">◐</div>;
  } else {
    statusIcon = <div className="req-status req-status-incomplete">✗</div>;
  }

  const progressPercent = Math.round(result.percentage * 100);

  return (
    <div className="requirement-item" style={{ marginLeft: `${level * 20}px` }}>
      <div className="requirement-header">
        {canExpand && (
          <button
            className="expand-btn"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <Icon
              name={expanded ? 'chevron-down' : 'chevron-right'}
              width={16}
              height={16}
            />
          </button>
        )}
        {!canExpand && <div style={{ width: 24 }} />}

        {statusIcon}

        <div className="requirement-name">
          <div className="req-title">{result.requirement.name}</div>
          {result.matchedChildren.length > 0 && (
            <div className="req-progress">
              {result.matchedChildren.filter((c) => c.satisfied).length} /{' '}
              {result.matchedChildren.length} requirements met
            </div>
          )}
          {result.matchedCourses && result.matchedCourses.length > 0 && (
            <div className="req-matched-courses">
              ✓ {result.matchedCourses.join(', ')}
            </div>
          )}
          {!result.satisfied && result.courseSuggestions && result.courseSuggestions.length > 0 && (
            <div className="req-course-suggestions">
              💡 Try: {result.courseSuggestions.slice(0, 3).join(', ')}
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="requirement-children">
          {hasChildren && result.matchedChildren.map((child) => (
            <RequirementItem
              key={child.requirement.id}
              result={child}
              level={level + 1}
            />
          ))}
          {!hasChildren && hasSuggestions && (
            <div className="requirement-suggestions-list">
              {result.courseSuggestions!.map((course, idx) => (
                <div key={idx} className="suggestion-item">
                  {course}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RequirementsSidebar({
  requirements,
  isOpen,
  onClose,
  programName,
  isLoading = false,
}: RequirementsSidebarProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div className="req-sidebar-overlay" onClick={onClose} />

      {/* Sidebar */}
      <div className="req-sidebar">
        <div className="req-sidebar-header">
          <h2>Major Requirements</h2>
          <button className="req-close-btn" onClick={onClose}>
            <Icon name="x" width={24} height={24} />
          </button>
        </div>

        <div className="req-sidebar-content">
          <div className="req-program-info">
            <h3>{programName}</h3>
            <div className="req-summary">
              <div className="req-summary-item">
                <span className="req-status-badge req-status-complete">✓</span>
                <span>Satisfied</span>
              </div>
              <div className="req-summary-item">
                <span className="req-status-badge req-status-partial">◐</span>
                <span>In Progress</span>
              </div>
              <div className="req-summary-item">
                <span className="req-status-badge req-status-incomplete">✗</span>
                <span>Not Started</span>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="req-list">
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Loading requirements...
              </div>
            </div>
          ) : requirements ? (
            <div className="req-list">
              <RequirementItem result={requirements} level={0} />
            </div>
          ) : (
            <div className="req-list">
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No requirements found
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
