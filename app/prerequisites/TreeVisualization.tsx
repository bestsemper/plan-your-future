"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { Icon } from "../components/Icon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "../components/DropdownMenu";

interface TreeVisualizationProps {
  department: string;
  departmentFullName: string;
}

interface Course {
  id: string;
  label: string;
  title?: string;
  type?: string;
  prereqs: string[];
}

interface DagData {
  nodes: Course[];
  edges: Array<{ parent: string; children: string[] }>;
  coreqEdges?: Array<{ parent: string; children: string[] }>;
}

export const TreeVisualization: React.FC<TreeVisualizationProps> = ({ department, departmentFullName }) => {
  const [dagData, setDagData] = useState<DagData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [clickedNodeId, setClickedNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [courseSearchText, setCourseSearchText] = useState("");
  const [showCourseSearchDropdown, setShowCourseSearchDropdown] = useState(false);
  const [isDark, setIsDark] = useState(false);
  // Use refs for panning state to avoid rebinding event listeners
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; scrollX: number; scrollY: number } | null>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!department) return;

    async function fetchDAG() {
      setLoading(true);
      setError(null);
      setDagData(null); // Reset data while loading new department
      setClickedNodeId(null); // Clear any clicked node when changing departments
      setCourseSearchText("");
      setShowCourseSearchDropdown(false);
      try {
        const res = await fetch(`/api/tree?department=${department}`);
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        const data = await res.json();
        setDagData(data);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Failed to fetch DAG:", errorMessage);
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    }

    fetchDAG();
  }, [department]);

  // Handle clicking outside the popup to close it
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const clickedOutsidePopup = popupRef.current ? !popupRef.current.contains(event.target as Node) : true;
      if (clickedOutsidePopup) {
        const target = event.target as HTMLElement;
        // Don't close if clicking on a node (they have their own click handler)
        if (!target.closest('[data-node-id]')) {
          setClickedNodeId(null);
          setHoveredNodeId(null);
          setHoverPos(null);
        }
      }
    }

    if (clickedNodeId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [clickedNodeId]);

  // Detect dark mode
  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains('dark');
    setIsDark(isDarkMode);

    const observer = new MutationObserver(() => {
      const isDarkNow = document.documentElement.classList.contains('dark');
      setIsDark(isDarkNow);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
    };
  }, []);

  const layout = useMemo(() => {
    if (!dagData || dagData.nodes.length === 0) return null;

    // Layout parameters
    const nodeW = 90;
    const nodeH = 40;
    const minNodeSpacing = 140;
    const levelHeight = 100;
    const padding = 50;
    const nodeFontSize = 12;
    const strokeWidth = 1.5;
    const arrowMarkerSize = 6;
    const maxNodesPerLevel = 7; // Max nodes per row before pushing down

    // Build edges map
    const edgesMap = new Map<string, Set<string>>();
    const reverseEdgesMap = new Map<string, Set<string>>();
    const coreqMap = new Map<string, Set<string>>();
    dagData.nodes.forEach((course) => {
      edgesMap.set(course.id, new Set());
      reverseEdgesMap.set(course.id, new Set());
      coreqMap.set(course.id, new Set());
    });
    dagData.edges.forEach((edge) => {
      edge.children.forEach((child) => {
        edgesMap.get(edge.parent)?.add(child);
        reverseEdgesMap.get(child)?.add(edge.parent);
      });
    });
    
    // Build coreq map
    if (dagData.coreqEdges) {
      dagData.coreqEdges.forEach((edge) => {
        edge.children.forEach((child) => {
          coreqMap.get(edge.parent)?.add(child);
        });
      });
    }

    // Extract course level from course code (e.g., "CS 2100" -> 2000)
    function getCourseLevel(courseId: string): number {
      const match = courseId.match(/(\d)(\d{3})/);
      if (match) {
        const levelDigit = match[1];
        return parseInt(levelDigit) * 1000;
      }
      return 0;
    }

    // Group courses by level
    const courseLevels = new Map<number, string[]>();
    dagData.nodes.forEach((course) => {
      const level = getCourseLevel(course.id);
      if (!courseLevels.has(level)) courseLevels.set(level, []);
      courseLevels.get(level)!.push(course.id);
    });

    // Sort levels numerically
    const sortedLevels = Array.from(courseLevels.keys()).sort((a, b) => a - b);

    // Calculate depth within each level based on both internal and external prerequisites
    function calculateDepthWithinLevel(courses: string[], level: number): Map<string, number> {
      const depthMap = new Map<string, number>();
      const courseSet = new Set(courses);
      const visitedAllCourses = new Set<string>();
      
      // Initialize all courses to depth -1 (unvisited)
      courses.forEach(c => depthMap.set(c, -1));
      
      // Topological sort using DFS that considers ALL prerequisites (internal or external)
      // Use states: -1 = unvisited, 0 = in progress (cycle detection), > 0 = computed depth
      function dfs(courseId: string): number {
        const state = depthMap.get(courseId);
        
        // Already computed
        if (state! > 0) {
          return state!;
        }
        
        // In progress - cycle detected, return 0 to break the cycle
        if (state === 0) {
          return 0;
        }
        
        // Mark as in progress
        depthMap.set(courseId, 0);
        
        // Find ALL prerequisites of this course, including from other levels
        const allPrereqs = reverseEdgesMap.get(courseId) || new Set();
        
        // Separate into internal (same level) and external (other levels)
        const internalPrereqs = Array.from(allPrereqs).filter(p => courseSet.has(p));
        const externalPrereqs = Array.from(allPrereqs).filter(p => !courseSet.has(p));
        
        // Calculate depth from internal prerequisites
        let internalDepth = -1;
        if (internalPrereqs.length > 0) {
          internalDepth = Math.max(...internalPrereqs.map(p => dfs(p)));
        }
        
        // If has external prerequisites (from other levels), boost depth to show it depends on this level
        let depthBoost = 0;
        if (externalPrereqs.length > 0) {
          depthBoost = 0.5; // Slight boost for courses with external dependencies
        }
        
        const depth = (internalDepth >= 0 ? internalDepth + 1 : 0) + depthBoost;
        depthMap.set(courseId, depth);
        return depth;
      }
      
      // Calculate depth for all courses
      courses.forEach(courseId => {
        if (depthMap.get(courseId)! === -1) {
          dfs(courseId);
        }
      });
      
      return depthMap;
    }

    // Sort courses within each level by depth and organize into depth-based rows
    const sortedCourseLevels = new Map<number, string[]>();
    const depthMapsByLevel = new Map<number, Map<string, number>>();
    
    for (const level of sortedLevels) {
      const coursesAtLevel = courseLevels.get(level)!;
      const depthMap = calculateDepthWithinLevel(coursesAtLevel, level);
      depthMapsByLevel.set(level, depthMap);
      
      // Sort by depth first, then by course ID for consistency
      const sorted = coursesAtLevel.sort((a, b) => {
        const depthA = depthMap.get(a) || 0;
        const depthB = depthMap.get(b) || 0;
        if (depthA !== depthB) return depthA - depthB;
        return a.localeCompare(b);
      });
      
      sortedCourseLevels.set(level, sorted);
    }

    // Build coreq groups - track which courses are corequisites of each other
    const coreqGroup = new Map<string, Set<string>>();
    dagData.nodes.forEach(course => {
      coreqGroup.set(course.id, new Set());
    });
    if (dagData.coreqEdges) {
      dagData.coreqEdges.forEach((edge) => {
        edge.children.forEach((child) => {
          coreqGroup.get(edge.parent)?.add(child);
          coreqGroup.get(child)?.add(edge.parent); // bidirectional
        });
      });
    }

    // Group levels into rows, separating by depth level WITHIN each course level
    // Also keep corequisites together in the same row
    const levelRows = new Map<number, string[]>(); // rowIndex -> courseIds
    let currentRowIndex = 0;
    let currentRowCount = 0;
    let lastDepth = -1;
    const placedCourses = new Set<string>();

    for (const level of sortedLevels) {
      const coursesAtLevel = sortedCourseLevels.get(level)!;
      const depthMap = depthMapsByLevel.get(level)!;
      
      // First, move to next row for new level group
      if (coursesAtLevel.length > 0) {
        currentRowIndex++;
        currentRowCount = 0;
        lastDepth = -1;
      }
      
      // Add courses from this level, creating new rows when depth changes or we hit maxNodesPerLevel
      // Group corequisites together
      for (const courseId of coursesAtLevel) {
        if (placedCourses.has(courseId)) continue; // Already placed as part of a coreq group
        
        const depth = Math.floor(depthMap.get(courseId) || 0);
        
        // Get corequisites for this course that are also in this level
        const coreqs = Array.from(coreqGroup.get(courseId) || []).filter(
          c => coursesAtLevel.includes(c) && !placedCourses.has(c)
        );
        
        // Check if adding this course and its coreqs would exceed row size
        const groupSize = 1 + coreqs.length;
        
        // Move to next row if depth changes OR if we've hit max nodes per row OR if group won't fit
        if (
          (lastDepth >= 0 && depth !== lastDepth) || 
          (currentRowCount > 0 && currentRowCount + groupSize > maxNodesPerLevel)
        ) {
          currentRowIndex++;
          currentRowCount = 0;
        }
        
        if (!levelRows.has(currentRowIndex)) {
          levelRows.set(currentRowIndex, []);
        }
        
        // Add the course and its corequisites together
        levelRows.get(currentRowIndex)!.push(courseId);
        placedCourses.add(courseId);
        currentRowCount++;
        
        // Add corequisites right after
        for (const coreq of coreqs) {
          if (currentRowCount >= maxNodesPerLevel) {
            currentRowIndex++;
            currentRowCount = 0;
            if (!levelRows.has(currentRowIndex)) {
              levelRows.set(currentRowIndex, []);
            }
          }
          levelRows.get(currentRowIndex)!.push(coreq);
          placedCourses.add(coreq);
          currentRowCount++;
        }
        
        lastDepth = depth;
      }
    }

    const maxRowIndex = Math.max(...Array.from(levelRows.keys()), 0);
    const maxNodesAtRow = Math.max(...Array.from(levelRows.values()).map(arr => arr.length), 1);
    
    // Calculate initial dimensions
    let totalWidth = Math.max(600, maxNodesAtRow * minNodeSpacing + padding * 2);
    const totalHeight = (maxRowIndex + 1) * levelHeight + padding * 2;
    
    // Position nodes and check bounds
    const positionMap = new Map<string, { x: number; y: number }>();
    let minX = Infinity;
    let maxX = -Infinity;

    for (let rowIdx = 0; rowIdx <= maxRowIndex; rowIdx++) {
      const coursesAtRow = levelRows.get(rowIdx) || [];
      const levelWidth = coursesAtRow.length * minNodeSpacing;
      const startX = (totalWidth - levelWidth) / 2 + minNodeSpacing / 2;
      const y = padding + rowIdx * levelHeight;

      coursesAtRow.forEach((courseId, index) => {
        const x = startX + index * minNodeSpacing;
        positionMap.set(courseId, { x, y });
        minX = Math.min(minX, x - nodeW / 2);
        maxX = Math.max(maxX, x + nodeW / 2);
      });
    }

    // Check if nodes extend beyond bounds and recalculate if needed
    const currentSpan = maxX - minX;
    if (currentSpan + padding * 2 > totalWidth) {
      totalWidth = currentSpan + padding * 2;
      
      // Reposition nodes with the new width
      positionMap.clear();
      for (let rowIdx = 0; rowIdx <= maxRowIndex; rowIdx++) {
        const coursesAtRow = levelRows.get(rowIdx) || [];
        const levelWidth = coursesAtRow.length * minNodeSpacing;
        const startX = (totalWidth - levelWidth) / 2 + minNodeSpacing / 2;
        const y = padding + rowIdx * levelHeight;

        coursesAtRow.forEach((courseId, index) => {
          positionMap.set(courseId, { x: startX + index * minNodeSpacing, y });
        });
      }
    }

    // Helper: Check if a line segment intersects a rectangle (node bounding box)
    function lineIntersectsBox(
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      boxX: number,
      boxY: number,
      boxW: number,
      boxH: number
    ): boolean {
      const left = boxX - boxW / 2;
      const right = boxX + boxW / 2;
      const top = boxY - boxH / 2;
      const bottom = boxY + boxH / 2;

      // Check if either endpoint is inside the box
      if (
        (x1 >= left && x1 <= right && y1 >= top && y1 <= bottom) ||
        (x2 >= left && x2 <= right && y2 >= top && y2 <= bottom)
      ) {
        return true;
      }

      // Check line intersection with box edges
      const intersectsLineSegment = (sx1: number, sy1: number, sx2: number, sy2: number): boolean => {
        const denom = (y2 - y1) * (sx2 - sx1) - (x2 - x1) * (sy2 - sy1);
        if (Math.abs(denom) < 1e-10) return false;

        const ua = ((x2 - x1) * (sy1 - y1) - (y2 - y1) * (sx1 - x1)) / denom;
        const ub = ((sx2 - sx1) * (sy1 - y1) - (sy2 - sy1) * (sx1 - x1)) / denom;

        return ua > 0 && ua < 1 && ub > 0 && ub < 1;
      };

      // Check intersection with all four edges of the box
      return (
        intersectsLineSegment(left, top, right, top) || // top
        intersectsLineSegment(right, top, right, bottom) || // right
        intersectsLineSegment(right, bottom, left, bottom) || // bottom
        intersectsLineSegment(left, bottom, left, top) // left
      );
    }

    // Helper: Find nodes that block the direct path
    function findBlockingNodes(
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      obstacles: Array<{ x: number; y: number; w: number; h: number }>,
      startNodeId: string,
      endNodeId: string
    ): Array<{ x: number; y: number; w: number; h: number }> {
      const relevant = obstacles.filter((obs) => {
        // Skip start and end nodes
        if (
          obs.x === positionMap.get(startNodeId)?.x &&
          obs.y === positionMap.get(startNodeId)?.y
        ) {
          return false;
        }
        if (
          obs.x === positionMap.get(endNodeId)?.x &&
          obs.y === positionMap.get(endNodeId)?.y
        ) {
          return false;
        }
        // Check if line intersects this node's box
        return lineIntersectsBox(x1, y1, x2, y2, obs.x, obs.y, obs.w, obs.h);
      });

      return relevant;
    }

    // Helper: Calculate smooth curve around obstacles using Bezier curves
    function calculateSmoothPath(
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      obstacles: Array<{ x: number; y: number; w: number; h: number }>,
      startNodeId: string,
      endNodeId: string
    ): Array<{ x: number; y: number }> {
      // Find the rows containing start and end nodes
      let startRowIdx = -1;
      let endRowIdx = -1;
      
      for (const [rowIdx, coursesAtRow] of levelRows) {
        if (coursesAtRow.includes(startNodeId)) startRowIdx = rowIdx;
        if (coursesAtRow.includes(endNodeId)) endRowIdx = rowIdx;
      }
      
      if (startRowIdx === -1 || endRowIdx === -1 || startRowIdx === endRowIdx) {
        // Same row or not found, go direct
        return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
      }
      
      // Get intermediate row indices
      const minRow = Math.min(startRowIdx, endRowIdx);
      const maxRow = Math.max(startRowIdx, endRowIdx);
      const intermediateRows: number[] = [];
      
      for (let i = minRow + 1; i < maxRow; i++) {
        intermediateRows.push(i);
      }
      
      // If no intermediate rows, just go direct
      if (intermediateRows.length === 0) {
        return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
      }
      
      // Build waypoints through gaps in intermediate rows
      const waypoints: Array<{ x: number; y: number }> = [{ x: x1, y: y1 }];
      
      // Track the current gap X position to prefer continuous paths
      let currentGapX = x1;
      
      // For each intermediate row, find the best gap and add top+bottom waypoints
      for (const rowIdx of intermediateRows) {
        const coursesAtRow = levelRows.get(rowIdx) || [];
        
        if (coursesAtRow.length === 0) continue;
        
        // Get positions within this row and sort by x coordinate
        const nodePositions = coursesAtRow
          .map(courseId => positionMap.get(courseId)?.x || 0)
          .sort((a, b) => a - b);
        
        // Find gaps between nodes in this row
        const gaps: number[] = [];
        
        // Gap before first node
        gaps.push(nodePositions[0] - minNodeSpacing / 2);
        
        // Gaps between consecutive nodes
        for (let i = 0; i < nodePositions.length - 1; i++) {
          const midX = (nodePositions[i] + nodePositions[i + 1]) / 2;
          gaps.push(midX);
        }
        
        // Gap after last node
        gaps.push(nodePositions[nodePositions.length - 1] + minNodeSpacing / 2);
        
        // Find closest gap to current gap position (for consistency across rows)
        // If multiple gaps are equidistant, prefer the one in direction of target node
        const endNodeX = positionMap.get(endNodeId)?.x || x2;
        let bestDistance = Math.abs(gaps[0] - currentGapX);
        const closestGaps: number[] = [gaps[0]];
        
        for (const gapX of gaps.slice(1)) {
          const distance = Math.abs(gapX - currentGapX);
          if (distance < bestDistance) {
            bestDistance = distance;
            closestGaps.length = 0;
            closestGaps.push(gapX);
          } else if (distance === bestDistance) {
            closestGaps.push(gapX);
          }
        }
        
        // If there are ties, pick the one in direction of target node
        let bestGapX: number;
        if (closestGaps.length > 1) {
          // If target is to the right, pick the rightmost gap; if left, pick leftmost
          bestGapX = endNodeX > currentGapX ? Math.max(...closestGaps) : Math.min(...closestGaps);
        } else {
          bestGapX = closestGaps[0];
        }
        
        // Update current gap position for next row
        currentGapX = bestGapX;
        
        // Get the Y position of this row (use first course in row as reference)
        const firstCourseInRow = coursesAtRow[0];
        const rowY = positionMap.get(firstCourseInRow)?.y || 0;
        
        // Add waypoints at top and bottom of the gap in this row
        const topOfGap = rowY - nodeH / 2 - 5; // Small padding above row
        const bottomOfGap = rowY + nodeH / 2 + 5; // Small padding below row
        
        waypoints.push({ x: bestGapX, y: topOfGap });
        waypoints.push({ x: bestGapX, y: bottomOfGap });
      }
      
      // Add end point
      waypoints.push({ x: x2, y: y2 });
      
      return waypoints;
    }

    // Build obstacles list
    const obstacles = dagData.nodes.map((course) => ({
      x: positionMap.get(course.id)?.x || 0,
      y: positionMap.get(course.id)?.y || 0,
      w: nodeW,
      h: nodeH,
    }));

    // Create edges with smooth curves around obstacles
    const edgeLines: {
      waypoints: Array<{ x: number; y: number }>;
      parentId?: string;
      childId?: string;
    }[] = [];
    edgesMap.forEach((children, parentId) => {
      const parentPos = positionMap.get(parentId);
      if (!parentPos) return;

      children.forEach((childId) => {
        const childPos = positionMap.get(childId);
        if (!childPos) return;

        const waypoints = calculateSmoothPath(
          parentPos.x,
          parentPos.y + nodeH / 2,
          childPos.x,
          childPos.y - nodeH / 2,
          obstacles,
          parentId,
          childId
        );

        edgeLines.push({ waypoints, parentId, childId });
      });
    });

    // Create coreq edge lines (bidirectional edges)
    const coreqEdgeLines: {
      waypoints: Array<{ x: number; y: number }>;
      parentId?: string;
      childId?: string;
    }[] = [];
    
    if (dagData.coreqEdges) {
      const coreqEdgesMap = new Map<string, Set<string>>();
      dagData.nodes.forEach((course) => {
        coreqEdgesMap.set(course.id, new Set());
      });
      dagData.coreqEdges.forEach((edge) => {
        edge.children.forEach((child) => {
          coreqEdgesMap.get(edge.parent)?.add(child);
        });
      });
      
      // Track edges we've already drawn to avoid duplicates for bidirectional edges
      const drawnCoreqEdges = new Set<string>();
      
      coreqEdgesMap.forEach((children, parentId) => {
        const parentPos = positionMap.get(parentId);
        if (!parentPos) return;

        children.forEach((childId) => {
          const childPos = positionMap.get(childId);
          if (!childPos) return;

          // Create a unique key for this edge (sorted to handle bidirectional)
          const edgeKey = [parentId, childId].sort().join('|');
          
          // Skip if we've already drawn this edge (handles bidirectional coreqs)
          if (drawnCoreqEdges.has(edgeKey)) return;
          drawnCoreqEdges.add(edgeKey);

          // Bidirectional: place waypoints to curve around
          const midY = (parentPos.y + childPos.y) / 2;
          const waypoints = [
            { x: parentPos.x, y: parentPos.y + nodeH / 2 },
            { x: childPos.x, y: childPos.y - nodeH / 2 }
          ];

          coreqEdgeLines.push({ waypoints, parentId, childId });
        });
      });
    }

    // Create positioned nodes
    const positionedNodes = dagData.nodes.map((course) => ({
      id: course.id,
      label: course.label,
      type: course.type,
      x: positionMap.get(course.id)?.x || 0,
      y: positionMap.get(course.id)?.y || 0,
    }));

    return {
      nodes: positionedNodes,
      edges: edgeLines,
      coreqEdges: coreqEdgeLines,
      totalWidth,
      totalHeight,
      nodeW,
      nodeH,
      nodeFontSize,
      strokeWidth,
      arrowMarkerSize,
      edgesMap,
      reverseEdgesMap,
      coreqMap,
    };
  }, [dagData]);

  const handleZoom = (delta: number) => {
    setZoom((prevZoom) => {
      const newZoom = Math.max(0.2, Math.min(5, prevZoom + delta));
      if (newZoom === prevZoom) return prevZoom;

      const container = svgContainerRef.current;
      if (container) {
        // Attempt to keep the center of the viewport fixed
        const rect = container.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        const scrollLeft = container.scrollLeft;
        const scrollTop = container.scrollTop;
        
        const unscaledX = (scrollLeft + centerX) / prevZoom;
        const unscaledY = (scrollTop + centerY) / prevZoom;
        
        const newScrollLeft = unscaledX * newZoom - centerX;
        const newScrollTop = unscaledY * newZoom - centerY;
        
        // Wait for render to update the container size
        setTimeout(() => {
          if (svgContainerRef.current) {
            svgContainerRef.current.scrollLeft = newScrollLeft;
            svgContainerRef.current.scrollTop = newScrollTop;
          }
        }, 0);
      }
      return newZoom;
    });
  };

  const filteredCourseMatches = useMemo(() => {
    const query = courseSearchText.trim().toLowerCase();
    if (!query || !dagData) return [];

    return dagData.nodes
      .filter((node) => {
        const id = node.id.toLowerCase();
        const label = node.label.toLowerCase();
        const title = (node.title || '').toLowerCase();
        return id.includes(query) || label.includes(query) || title.includes(query);
      })
      .sort((a, b) => {
        const aId = a.id.toLowerCase();
        const bId = b.id.toLowerCase();
        const aTitle = (a.title || '').toLowerCase();
        const bTitle = (b.title || '').toLowerCase();

        const aStartsId = aId.startsWith(query);
        const bStartsId = bId.startsWith(query);
        if (aStartsId !== bStartsId) return aStartsId ? -1 : 1;

        const aStartsTitle = aTitle.startsWith(query);
        const bStartsTitle = bTitle.startsWith(query);
        if (aStartsTitle !== bStartsTitle) return aStartsTitle ? -1 : 1;

        return a.id.localeCompare(b.id);
      });
  }, [courseSearchText, dagData]);

  const focusNodeInViewport = (nodeId: string) => {
    const container = svgContainerRef.current;
    if (!container || !layout) return;

    const node = layout.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const xRatio = layout.totalWidth > 0 ? node.x / layout.totalWidth : 0.5;
    const yRatio = layout.totalHeight > 0 ? node.y / layout.totalHeight : 0.5;
    const targetLeft = xRatio * container.scrollWidth - container.clientWidth / 2;
    const targetTop = yRatio * container.scrollHeight - container.clientHeight / 2;

    container.scrollTo({
      left: Math.max(0, targetLeft),
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    });
  };

  const handleSelectCourseFromSearch = (nodeId: string) => {
    setClickedNodeId(nodeId);
    setHoveredNodeId(null);
    setHoverPos({ x: 0, y: 0 });
    setShowCourseSearchDropdown(false);
    setCourseSearchText("");
    setTimeout(() => focusNodeInViewport(nodeId), 0);
  };

  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0 || e.button === 2) {
        // Left-click or Right-click for pan
        setIsPanning(true);
        isPanningRef.current = true;
        panStartRef.current = { x: e.clientX, y: e.clientY, scrollX: container.scrollLeft, scrollY: container.scrollTop };
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isPanningRef.current && panStartRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        container.scrollLeft = panStartRef.current.scrollX - dx;
        container.scrollTop = panStartRef.current.scrollY - dy;
      }
    };

    const handleMouseUp = () => {
      setIsPanning(false);
      isPanningRef.current = false;
      panStartRef.current = null;
    };

    container.addEventListener('mousedown', handleMouseDown);
    // Bind to window to allow dragging outside of container bounds
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [layout]); // Important: must re-run when layout is ready so container ref is not null

  if (loading) {
    return <div className="text-gray-600 p-4">Loading...</div>;
  }

  if (error) {
    return <div className="text-red-600 p-4">Error: {error}</div>;
  }

  if (!layout) {
    return <div className="text-gray-600 p-4">No courses to display</div>;
  }

  const { nodes, edges, coreqEdges, totalWidth, totalHeight, nodeW, nodeH, nodeFontSize, strokeWidth, arrowMarkerSize, edgesMap, reverseEdgesMap, coreqMap } = layout;
  
  // Helper function to darken a color
  const darkenColor = (color: string, factor: number) => {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * factor * 100);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, (num >> 8 & 0x00FF) - amt);
    const B = Math.max(0, (num & 0x0000FF) - amt);
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  };

  // Helper function to lighten a color
  const lightenColor = (color: string, factor: number) => {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * factor * 100);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, (num >> 8 & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  };

  const visibleSearchMatches = filteredCourseMatches.slice(0, 25);
  const showSearchPanel = showCourseSearchDropdown && courseSearchText.trim().length > 0;

  const formatNodeLabel = (id: string, isPostreq = false, depth = 0): string => {
    const node = dagData?.nodes.find(n => n.id === id);
    if (!node) return id;
    if (node.type === 'or' || node.type === 'and') {
      const relatedEdges = isPostreq ? edgesMap?.get(id) : reverseEdgesMap?.get(id);
      const children = Array.from(relatedEdges || new Set<string>()) as string[];
      const formatted = children.map(c => formatNodeLabel(c, isPostreq, depth + 1));
      const joinStr = node.type === 'or' ? ' OR ' : ' AND ';
      
      const out = formatted.join(joinStr);
      if (node.label === 'OR' || node.label === 'AND') {
        return depth > 0 && children.length > 1 ? `(${out})` : out;
      } else {
        return `${node.label} (${formatted.join(', ')})`;
      }
    }
    return node.id;
  };

  const formatPrerequisiteLabel = (requirement: string): { label: string; value: string } => {
    const trimmed = requirement.trim();
    
    if (/^\(\d+ OF\)/.test(trimmed)) {
      const match = trimmed.match(/^\((\d+) OF\)/);
      return {
        label: `${match?.[1] || ''} Of`,
        value: trimmed.replace(/^\(\d+ OF\)\s*/, ''),
      };
    }
    
    if (trimmed.includes(' OR ')) {
      return {
        label: 'One Of',
        value: trimmed,
      };
    }
    
    if (trimmed.includes(' AND ')) {
      return {
        label: 'All Of',
        value: trimmed,
      };
    }
    
    return {
      label: '',
      value: trimmed,
    };
  };

  return (
    <div className="w-full h-full flex flex-col bg-panel-bg absolute inset-0 overflow-hidden min-w-0 min-h-0">
      {/* Search Bar - Left Side */}
      <DropdownMenu
        isOpen={showSearchPanel}
        onOpenChange={setShowCourseSearchDropdown}
        contentClassName="-inset-x-0.75"
        className="absolute top-4 left-4 right-40 z-10 sm:right-44 md:right-40 lg:w-80 lg:right-auto"
        trigger={
          <div className="relative bg-panel-bg/90 backdrop-blur p-0.5 rounded-xl border border-panel-border shadow-sm">
            <Icon
              name="search"
              color="currentColor"
              width={16}
              height={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary"
            />
            <input
              type="text"
              placeholder="Search courses in tree"
              value={courseSearchText}
              onChange={(e) => {
                setCourseSearchText(e.target.value);
                setShowCourseSearchDropdown(true);
              }}
              onClick={() => setShowCourseSearchDropdown(true)}
              className="w-full h-[40px] pl-10 pr-4 rounded-lg bg-input-bg text-text-primary outline-none"
            />
          </div>
        }
      >
        <DropdownMenuContent maxHeight="max-h-64">
          {visibleSearchMatches.length > 0 ? (
            visibleSearchMatches.map((course) => (
              <DropdownMenuItem
                key={course.id}
                selected={clickedNodeId === course.id}
                onClick={() => handleSelectCourseFromSearch(course.id)}
                description={course.title || course.id}
              >
                {course.label}
              </DropdownMenuItem>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-text-secondary">No matching courses found</div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Old outer container removed - styling moved to trigger */}

      {/* Zoom Controls - Right Side */}
      <div className="absolute top-4 right-4 z-10 bg-panel-bg/90 backdrop-blur p-0.5 rounded-xl border border-panel-border shadow-sm flex items-center">
        <div className="flex bg-panel-bg rounded-lg overflow-hidden">
          <button 
            onClick={() => handleZoom(0.2)} 
            className="flex items-center justify-center p-2.5 text-text-tertiary cursor-pointer transition-colors"
            title="Zoom In"
          >
            <Icon 
              name="zoom-in"
              color="currentColor"
              width={20}
              height={20}
            />
          </button>
          <div className="w-px bg-panel-border"></div>
          <button 
            onClick={() => handleZoom(-0.2)} 
            className="flex items-center justify-center p-2.5 text-text-tertiary cursor-pointer transition-colors"
            title="Zoom Out"
          >
            <Icon 
              name="zoom-out"
              color="currentColor"
              width={20}
              height={20}
            />
          </button>
          <div className="w-px bg-panel-border"></div>
          <button 
            onClick={() => setZoom(1)} 
            className="flex items-center justify-center p-2.5 text-text-tertiary cursor-pointer transition-colors"
            title="Reset Zoom"
          >
            <Icon 
              name="home"
              color="currentColor"
              width={20}
              height={20}
            />
          </button>
        </div>
      </div>

      {/* Tree Container */}
      <div
        ref={svgContainerRef}
        className="flex-1 overflow-auto"
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        <div
          style={{
            minWidth: '100%',
            minHeight: '100%',
            width: `${totalWidth * zoom}px`,
            height: `${totalHeight * zoom}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem'
          }}
        >
          <svg
            viewBox={`0 0 ${totalWidth} ${totalHeight}`}
            width="100%"
            height="100%"
            style={{ display: "block", overflow: "visible", cursor: 'pointer' }}
          >
          <defs>
          {/* Arrowheads are now drawn manually for proper rotation along curved edges */}
        </defs>

        {/* Draw edges */}
        {edges
          .sort((edgeA: any, edgeB: any) => {
            const activeNodeId = clickedNodeId || hoveredNodeId;
            const aConnected = activeNodeId && (edgeA.parentId === activeNodeId || edgeA.childId === activeNodeId);
            const bConnected = activeNodeId && (edgeB.parentId === activeNodeId || edgeB.childId === activeNodeId);
            // Non-highlighted edges first (false = 0, true = 1), highlighted edges last
            return (aConnected ? 1 : 0) - (bConnected ? 1 : 0);
          })
          .map((edge: any, idx) => {
          // Check if this edge is connected to hovered or clicked node
          const activeNodeId = clickedNodeId || hoveredNodeId;
          const isConnectedToActive = activeNodeId && (edge.parentId === activeNodeId || edge.childId === activeNodeId);
          
          // UVA brand color palette with professional tones (adjusted for dark mode)
          const paleColors = [
            "#a8d5e2", // pale blue
            "#f0a8c3", // pale pink
            "#c3e0a8", // pale green
            "#f5d4a8", // pale orange
            "#e0c3f0", // pale purple
            "#f0e0a8", // pale yellow
            "#a8f0d3", // pale mint
            "#f0bba8", // pale coral
            "#d4c3f0", // pale lavender
            "#c3f0e0", // pale cyan
            "#f0c3d4", // pale rose
            "#e0f0a8", // pale lime
          ];
          // Use stable color based on edge identity, not position
          const edgeHash = (edge.parentId + edge.childId).split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
          const edgeColor = paleColors[edgeHash % paleColors.length];
          // Darken color in light mode, lighten in dark mode when connected to active (hovered or clicked) node
          const displayColor = isConnectedToActive ? (isDark ? lightenColor(edgeColor, 0.15) : darkenColor(edgeColor, 0.4)) : edgeColor;

          // Helper function to create arrowhead polygon string
          const createArrowhead = (x: number, y: number, angle: number, size: number) => {
            // Arrowhead tip points at the target node
            // The base is offset back along the incoming direction
            const baseOffsetDist = size * 1.5; // length of arrow
            const baseX = x - Math.cos(angle) * baseOffsetDist;
            const baseY = y - Math.sin(angle) * baseOffsetDist;
            
            // Create a skinny arrowhead - perpendicular to the angle
            const perpAngle = angle + Math.PI / 2;
            const arrowWidth = size * 0.4; // skinny arrow
            
            const leftX = baseX + Math.cos(perpAngle) * arrowWidth;
            const leftY = baseY + Math.sin(perpAngle) * arrowWidth;
            
            const rightX = baseX - Math.cos(perpAngle) * arrowWidth;
            const rightY = baseY - Math.sin(perpAngle) * arrowWidth;
            
            // Tip at (x, y), base is the left and right points
            return `${x},${y} ${leftX},${leftY} ${rightX},${rightY}`;
          };

          // Multi-waypoint path through gaps - create smooth Bezier segments with perfect continuity
          const waypoints = edge.waypoints;
          const numPoints = waypoints.length;
          const p_end = waypoints[numPoints - 1];
          
          let pathData = `M ${waypoints[0].x} ${waypoints[0].y}`;
          
          if (numPoints === 2) {
            // Base case: 2 points
            const dy = p_end.y - waypoints[0].y;
            const tension = dy * 0.5;
            let cp0x = waypoints[0].x;
            let cp0y = waypoints[0].y + tension;
            let cp1x = p_end.x;
            let cp1y = p_end.y - tension;
            
            // Allow monotonicity
            if (cp0y > cp1y) {
              const midY = (waypoints[0].y + p_end.y) / 2;
              cp0y = midY;
              cp1y = midY;
            }
            
            // Re-calculate line stop since angle changes depending on cp1
            const dxEnd = p_end.x - cp1x;
            const dyEnd = p_end.y - cp1y;
            const angle = Math.atan2(dyEnd, dxEnd);
            const lineStopOffsetDist = arrowMarkerSize * 1.5;
            const lineStopX = p_end.x - Math.cos(angle) * lineStopOffsetDist;
            const lineStopY = p_end.y - Math.sin(angle) * lineStopOffsetDist;
            
            pathData += ` C ${cp0x} ${cp0y}, ${cp1x} ${cp1y}, ${lineStopX} ${lineStopY}`;
            
            return (
              <g key={`edge-${edge.parentId}-${edge.childId}`}>
                <path
                  d={pathData}
                  fill="none"
                  stroke={displayColor}
                  strokeWidth={isConnectedToActive ? strokeWidth * 2 : strokeWidth}
                  opacity={isConnectedToActive ? 1 : 0.7}
                />
                <polygon
                  points={createArrowhead(p_end.x, p_end.y, angle, arrowMarkerSize)}
                  fill={displayColor}
                  opacity={isConnectedToActive ? 1 : 0.7}
                />
              </g>
            );
          } else {
            // Complex case
            // Create nice splines passing near the waypoints
            // Waypoints are alternating top/bottom of gaps
            for (let i = 1; i < numPoints - 1; i++) {
              const p0 = waypoints[i - 1];
              const p1 = waypoints[i];
              
              const dy = p1.y - p0.y;
              // If it's a tight gap constraint (e.g. going from top to bottom of a row), use strong tension to go straight down
              const isGapInternal = Math.abs(p0.x - p1.x) < 5 && Math.abs(dy) <= nodeH + 20;
              const curTension = isGapInternal ? dy * 0.2 : dy * 0.5;
              
              let cp0x = p0.x;
              let cp0y = p0.y + curTension;
              let cp1x = p1.x;
              let cp1y = p1.y - curTension;
              
              // Allow monotonicity
              if (cp0y > cp1y && !isGapInternal) {
                const midY = (p0.y + p1.y) / 2;
                cp0y = midY;
                cp1y = midY;
              }
              
              pathData += ` C ${cp0x} ${cp0y}, ${cp1x} ${cp1y}, ${p1.x} ${p1.y}`;
            }
            
            // Final leg
            const p0 = waypoints[numPoints - 2];
            const dyEndTension = p_end.y - p0.y;
            const finalTension = dyEndTension * 0.5;
            let cp0xFinal = p0.x;
            let cp0yFinal = p0.y + finalTension;
            let cp1xFinal = p_end.x;
            let cp1yFinal = p_end.y - finalTension;
            
            if (cp0yFinal > cp1yFinal) {
              const midY = (p0.y + p_end.y) / 2;
              cp0yFinal = midY;
              cp1yFinal = midY;
            }
            
            const dxEnd = p_end.x - cp1xFinal;
            const dyEnd = p_end.y - cp1yFinal;
            const angle = Math.atan2(dyEnd, dxEnd);
            const lineStopOffsetDist = arrowMarkerSize * 1.5;
            const lineStopX = p_end.x - Math.cos(angle) * lineStopOffsetDist;
            const lineStopY = p_end.y - Math.sin(angle) * lineStopOffsetDist;
            
            pathData += ` C ${cp0xFinal} ${cp0yFinal}, ${cp1xFinal} ${cp1yFinal}, ${lineStopX} ${lineStopY}`;
            
            return (
              <g key={`edge-${edge.parentId}-${edge.childId}`}>
                <path
                  d={pathData}
                  fill="none"
                  stroke={displayColor}
                  strokeWidth={isConnectedToActive ? strokeWidth * 2 : strokeWidth * 0.5}
                  opacity={isConnectedToActive ? 1 : 0.7}
                />
                <polygon
                  points={createArrowhead(p_end.x, p_end.y, angle, arrowMarkerSize)}
                  fill={displayColor}
                  opacity={isConnectedToActive ? 1 : 0.7}
                />
              </g>
            );
          }
        })}

        {/* Draw corequisite edges (dashed) */}
        {coreqEdges
          .map((edge: any, idx) => {
          const activeNodeId = clickedNodeId || hoveredNodeId;
          const isConnectedToActive = activeNodeId && (edge.parentId === activeNodeId || edge.childId === activeNodeId);
          
          // Use a muted color for coreq edges
          const coreqColor = isDark ? "#9ca3af" : "#d1d5db";
          const displayColor = isConnectedToActive ? (isDark ? "#e5e7eb" : "#6b7280") : coreqColor;

          const waypoints = edge.waypoints;
          const numPoints = waypoints.length;
          
          // Simple path for coreq edges
          let pathData = `M ${waypoints[0].x} ${waypoints[0].y}`;
          if (numPoints === 2) {
            pathData += ` L ${waypoints[1].x} ${waypoints[1].y}`;
          } else {
            for (let i = 1; i < numPoints; i++) {
              pathData += ` L ${waypoints[i].x} ${waypoints[i].y}`;
            }
          }

          return (
            <g key={`coreq-edge-${edge.parentId}-${edge.childId}`}>
              <path
                d={pathData}
                fill="none"
                stroke={displayColor}
                strokeWidth={isConnectedToActive ? strokeWidth * 2 : strokeWidth * 0.6}
                strokeDasharray="4,4"
                opacity={isConnectedToActive ? 1 : 0.5}
              />
            </g>
          );
        })}

        {/* Draw nodes */}
        {nodes.map(({ id, label, x, y, type }) => {
          const isOrNode = type === 'or';
          const isAndNode = type === 'and';
          const isLogicNode = isOrNode || isAndNode;
          
          const getTargetCourse = (startId: string): string => {
            let curr = startId;
            const visited = new Set<string>();
            while (true) {
              if (visited.has(curr)) return curr;
              visited.add(curr);
              const node = dagData?.nodes.find(n => n.id === curr);
              if (node && node.type !== 'or' && node.type !== 'and') {
                return curr;
              }
              const children = Array.from(edgesMap?.get(curr) || []);
              if (children.length > 0) {
                curr = children[0] as string;
              } else {
                return curr;
              }
            }
          };
          
          const prereqs = dagData?.nodes.find(n => n.id === id)?.prereqs || [];
          const postreqs = Array.from(edgesMap?.get(id) || new Set());
          
          // Check if this node is directly connected to active (hovered or clicked) node
          const activeNodeId = clickedNodeId || hoveredNodeId;
          const isDirectlyConnected = activeNodeId && (postreqs.includes(activeNodeId) || reverseEdgesMap?.get(id)?.has(activeNodeId));
          
          if (isLogicNode) {
            return (
              <g key={id}>
                <circle
                  cx={x}
                  cy={y}
                  r={16}
                  fill={isDark ? (activeNodeId === id ? "#7b8a97" : isDirectlyConnected ? "#4b5563" : "#1f2937") : (activeNodeId === id ? "#e5e7eb" : isDirectlyConnected ? "#ececf1" : "#ffffff")}
                  stroke={isDark ? "#d97706" : "#f59e0b"}
                  strokeWidth={2}
                  onMouseEnter={(e) => {
                    if (!clickedNodeId) {
                      setHoveredNodeId(id);
                      setHoverPos({ x: 0, y: 0 });
                    }
                  }}
                  onMouseLeave={() => {
                    if (!clickedNodeId) {
                      setHoveredNodeId(null);
                      setHoverPos(null);
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const targetId = getTargetCourse(id);
                    if (clickedNodeId === targetId) {
                      setClickedNodeId(null);
                      setHoveredNodeId(null);
                      setHoverPos(null);
                    } else {
                      setClickedNodeId(targetId);
                      setHoveredNodeId(null);
                      setHoverPos({ x: 0, y: 0 });
                    }
                  }}
                  data-node-id={id}
                  style={{ cursor: "pointer" }}
                />
                <text
                  x={x}
                  y={y + 3}
                  textAnchor="middle"
                  fontSize={8}
                  fill={isDark ? "#e5e7eb" : "#111827"}
                  fontWeight="bold"
                  className="pointer-events-none select-none"
                >
                  {label}
                </text>
              </g>
            );
          }

          return (
            <g key={id}>
              <rect
                x={x - nodeW / 2}
                y={y - nodeH / 2}
                width={nodeW}
                height={nodeH}
                fill={isDark ? (activeNodeId === id ? "#7b8a97" : isDirectlyConnected ? "#4b5563" : "#1f2937") : (activeNodeId === id ? "#e5e7eb" : isDirectlyConnected ? "#ececf1" : "#ffffff")}
                stroke={isDark ? (activeNodeId === id ? "#6b7280" : isDirectlyConnected ? "#6b7280" : "#6b7280") : (activeNodeId === id ? "#9ca3af" : isDirectlyConnected ? "#d1d5db" : "#d1d5db")}
                strokeWidth={activeNodeId === id ? 2.5 : isDirectlyConnected ? 2 : strokeWidth}
                rx={strokeWidth * 2}
                onMouseEnter={(e) => {
                  if (!clickedNodeId) {
                    // Normal hover behavior when no node is clicked
                    setHoveredNodeId(id);
                    setHoverPos({ x: 0, y: 0 });
                  }
                }}
                onMouseLeave={() => {
                  // Only update hover state if no node is clicked
                  if (!clickedNodeId) {
                    setHoveredNodeId(null);
                    setHoverPos(null);
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (clickedNodeId === id) {
                    // Clicking the same node again closes the popup
                    setClickedNodeId(null);
                    setHoveredNodeId(null);
                    setHoverPos(null);
                  } else {
                    // Clicking a new node shows its persistent popup
                    setClickedNodeId(id);
                    setHoveredNodeId(null);
                    setHoverPos({ x: 0, y: 0 }); // Keep popup visible
                  }
                }}
                data-node-id={id}
                style={{ cursor: "pointer" }}
              />
              <text
                x={x}
                y={y + nodeFontSize / 3}
                textAnchor="middle"
                fontSize={nodeFontSize}
                fill={isDark ? "#e5e7eb" : "#111827"}
                fontWeight="600"
                className="pointer-events-none select-none"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      </div>
      </div>

      {(hoveredNodeId || clickedNodeId) && hoverPos && !dagData?.nodes.find(n => n.id === (clickedNodeId || hoveredNodeId))?.type && (() => {
        const targetId = clickedNodeId || hoveredNodeId;
        const targetNode = dagData?.nodes.find(n => n.id === targetId);
        
        let allPrereqsList: string[] = [];
        const rawPrereqs = Array.from(reverseEdgesMap?.get(targetId!) || new Set<string>());
        const depOrs: string[] = (targetNode as any)?.departmentOrs || [];
        

        
        // Filter out rawPrereqs that are part of a count node group
        const standalonePrereqs = rawPrereqs.filter(prereq => {
          return !depOrs.some(orStatement => {
            // Check if this course is mentioned in any (N OF) group
            const codes = (orStatement.match(/[A-Z]{2,6}\s*\d{3,4}[A-Z]?/g) || []).map(c => c.toUpperCase().replace(/\s+/g, ' '));
            return codes.includes(String(prereq).toUpperCase().replace(/\s+/g, ' '));
          });
        });
        
        allPrereqsList = [...standalonePrereqs.map(p => formatNodeLabel(String(p), false, 0)), ...depOrs];

        return (
          <div
            ref={popupRef}
            className="fixed bottom-5 right-5 z-[1000] min-w-[200px] max-w-[250px] bg-panel-bg border border-panel-border-strong rounded-lg p-3 text-xs shadow-lg pointer-events-auto"
          >
            <div className="font-bold mb-2 text-sm text-primary">
              {targetId}
            </div>
            <div className="text-xs mb-3 text-text-secondary italic max-h-20 overflow-y-auto">
              {targetNode?.title || targetNode?.label}
            </div>
            
            <div className="flex flex-col gap-2">
              {allPrereqsList.length > 0 && (
                <div>
                  <div className="font-semibold text-primary mb-1">
                    Prerequisites:
                  </div>
                  <div className="pl-2 text-text-muted">
                    {allPrereqsList.map((item, i) => (
                      <div key={i}>• {item}</div>
                    ))}
                  </div>
                </div>
              )}

              {((coreqMap?.get(targetId!) as Set<string> | undefined)?.size || 0) > 0 && (
                <div>
                  <div className="font-semibold text-primary mb-1">
                    Corequisites:
                  </div>
                  <div className="pl-2 text-text-muted">
                    {Array.from(coreqMap?.get(targetId!) as Set<string> | Set<unknown>).map((coreq: string | unknown) => (
                      <div key={coreq as string}>• {String(coreq)}</div>
                    ))}
                  </div>
                </div>
              )}
              
              {((edgesMap?.get(targetId!) as Set<string> | undefined)?.size || 0) > 0 && (
                <div>
                  <div className="font-semibold text-primary mb-1">
                    Required for:
                  </div>
                  <div className="pl-2 text-text-muted">
                    {Array.from(edgesMap?.get(targetId!) as Set<string> | Set<unknown>).map((postreq: string | unknown) => (
                      <div key={postreq as string}>• {formatNodeLabel(String(postreq), true, 0)}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};
