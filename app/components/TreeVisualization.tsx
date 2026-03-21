"use client";

import { useEffect, useMemo, useState, useRef } from "react";

interface TreeVisualizationProps {
  department: string;
  departmentFullName: string;
}

interface Course {
  id: string;
  label: string;
  title?: string;
  prereqs: string[];
}

interface DagData {
  nodes: Course[];
  edges: Array<{ parent: string; children: string[] }>;
}

export const TreeVisualization: React.FC<TreeVisualizationProps> = ({ department, departmentFullName }) => {
  const [dagData, setDagData] = useState<DagData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  // Use refs for panning state to avoid rebinding event listeners
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; scrollX: number; scrollY: number } | null>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!department) return;

    async function fetchDAG() {
      setLoading(true);
      setError(null);
      setDagData(null); // Reset data while loading new department
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
    dagData.nodes.forEach((course) => {
      edgesMap.set(course.id, new Set());
      reverseEdgesMap.set(course.id, new Set());
    });
    dagData.edges.forEach((edge) => {
      edge.children.forEach((child) => {
        edgesMap.get(edge.parent)?.add(child);
        reverseEdgesMap.get(child)?.add(edge.parent);
      });
    });

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

    // Group levels into rows, separating by depth level WITHIN each course level
    const levelRows = new Map<number, string[]>(); // rowIndex -> courseIds
    let currentRowIndex = 0;
    let currentRowCount = 0;
    let lastDepth = -1;

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
      for (const courseId of coursesAtLevel) {
        const depth = Math.floor(depthMap.get(courseId) || 0);
        
        // Move to next row if depth changes OR if we've hit max nodes per row
        if ((lastDepth >= 0 && depth !== lastDepth) || currentRowCount >= maxNodesPerLevel) {
          currentRowIndex++;
          currentRowCount = 0;
        }
        
        if (!levelRows.has(currentRowIndex)) {
          levelRows.set(currentRowIndex, []);
        }
        levelRows.get(currentRowIndex)!.push(courseId);
        currentRowCount++;
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
        let bestGapX = gaps[0];
        let bestDistance = Math.abs(gaps[0] - currentGapX);
        
        for (const gapX of gaps) {
          const distance = Math.abs(gapX - currentGapX);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestGapX = gapX;
          }
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

    // Create positioned nodes
    const positionedNodes = dagData.nodes.map((course) => ({
      id: course.id,
      label: course.label,
      x: positionMap.get(course.id)?.x || 0,
      y: positionMap.get(course.id)?.y || 0,
    }));

    return {
      nodes: positionedNodes,
      edges: edgeLines,
      totalWidth,
      totalHeight,
      nodeW,
      nodeH,
      nodeFontSize,
      strokeWidth,
      arrowMarkerSize,
      edgesMap,
      reverseEdgesMap,
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

  const { nodes, edges, totalWidth, totalHeight, nodeW, nodeH, nodeFontSize, strokeWidth, arrowMarkerSize, edgesMap, reverseEdgesMap } = layout;
  
  // Helper function to darken a color
  const darkenColor = (color: string, factor: number) => {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * factor * 100);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, (num >> 8 & 0x00FF) - amt);
    const B = Math.max(0, (num & 0x0000FF) - amt);
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  };

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 absolute inset-0 overflow-hidden min-w-0 min-h-0">
      <div className="absolute top-4 right-4 z-10 bg-white/90 backdrop-blur p-0.5 rounded-xl border border-blue-200 shadow-sm flex items-center">
        <div className="flex bg-white rounded-lg overflow-hidden">
          <button 
            onClick={() => handleZoom(0.2)} 
            className="p-2.5 text-blue-700 cursor-pointer"
            title="Zoom In"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          </button>
          <div className="w-px bg-blue-100"></div>
          <button 
            onClick={() => handleZoom(-0.2)} 
            className="p-2.5 text-blue-700 cursor-pointer"
            title="Zoom Out"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
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
        {edges.map((edge: any, idx) => {
          // Check if this edge is connected to hovered node
          const isConnectedToHovered = hoveredNodeId && (edge.parentId === hoveredNodeId || edge.childId === hoveredNodeId);
          
          // Pale color palette - distinguishable pastel colors
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
          const edgeColor = paleColors[idx % paleColors.length];
          // Darken color when connected to hovered node
          const displayColor = isConnectedToHovered ? darkenColor(edgeColor, 0.4) : edgeColor;

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

          // Multi-waypoint path through gaps - create smooth Bezier segments with no bulge
          const waypoints = edge.waypoints;
          const numPoints = waypoints.length;
          const p_prev = waypoints[numPoints - 2];
          const p_end = waypoints[numPoints - 1];
          
          // Get control points of the last segment to compute angle
          let cp_prevX, cp_prevY, cp_endX, cp_endY;
          if (numPoints === 2) {
            cp_prevX = waypoints[0].x;
            cp_prevY = waypoints[0].y + (p_end.y - waypoints[0].y) * 0.3;
            cp_endX = p_end.x;
            cp_endY = waypoints[0].y + (p_end.y - waypoints[0].y) * 0.7;
          } else {
            cp_prevX = p_prev.x * 0.7 + p_end.x * 0.3;
            cp_prevY = p_prev.y * 0.7 + p_end.y * 0.3;
            cp_endX = p_prev.x * 0.3 + p_end.x * 0.7;
            cp_endY = p_prev.y * 0.3 + p_end.y * 0.7;
          }
          
          const t = 0.95;
          const coef1 = 3 * Math.pow(1 - t, 2);
          const coef2 = 6 * (1 - t) * t;
          const coef3 = 3 * Math.pow(t, 2);
          const dx = coef1 * (cp_prevX - p_prev.x) + coef2 * (cp_endX - cp_prevX) + coef3 * (p_end.x - cp_endX);
          const dy = coef1 * (cp_prevY - p_prev.y) + coef2 * (cp_endY - cp_prevY) + coef3 * (p_end.y - cp_endY);
          const angle = Math.atan2(dy, dx);
          
          // Calculate where the line stops (before the node) but arrow stays at node
          const lineStopOffsetDist = arrowMarkerSize * 1.5;
          const lineStopX = p_end.x - Math.cos(angle) * lineStopOffsetDist;
          const lineStopY = p_end.y - Math.sin(angle) * lineStopOffsetDist;
          
          // Build path string with smooth Bezier curves, ending before the node
          let pathData = `M ${waypoints[0].x} ${waypoints[0].y}`;
          
          // For 2 waypoints, use simple curve
          if (numPoints === 2) {
            const x1 = waypoints[0].x;
            const y1 = waypoints[0].y;
            const cp1Y = y1 + (lineStopY - y1) * 0.3;
            const cp2Y = y1 + (lineStopY - y1) * 0.7;
            pathData = `M ${x1} ${y1} C ${x1} ${cp1Y}, ${lineStopX} ${cp2Y}, ${lineStopX} ${lineStopY}`;
          } else {
            // For multiple waypoints, create smooth connecting segments without bulge
            // Connect all waypoints except the last, then curve to line stop point
            for (let i = 1; i < numPoints - 1; i++) {
              const p0 = waypoints[i - 1];
              const p1 = waypoints[i];
              
              const cp0X = p0.x * 0.7 + p1.x * 0.3;
              const cp0Y = p0.y * 0.7 + p1.y * 0.3;
              const cp1X = p0.x * 0.3 + p1.x * 0.7;
              const cp1Y = p0.y * 0.3 + p1.y * 0.7;
              
              pathData += ` C ${cp0X} ${cp0Y}, ${cp1X} ${cp1Y}, ${p1.x} ${p1.y}`;
            }
            
            // Final segment to line stop point (not all the way to node)
            const cp0X = p_prev.x * 0.7 + lineStopX * 0.3;
            const cp0Y = p_prev.y * 0.7 + lineStopY * 0.3;
            const cp1X = p_prev.x * 0.3 + lineStopX * 0.7;
            const cp1Y = p_prev.y * 0.3 + lineStopY * 0.7;
            pathData += ` C ${cp0X} ${cp0Y}, ${cp1X} ${cp1Y}, ${lineStopX} ${lineStopY}`;
          }

          return (
            <g key={`edge-${idx}`}>
              <path
                d={pathData}
                fill="none"
                stroke={displayColor}
                strokeWidth={isConnectedToHovered ? strokeWidth * 2 : strokeWidth}
                opacity={isConnectedToHovered ? 1 : 0.7}
              />
              <polygon
                points={createArrowhead(p_end.x, p_end.y, angle, isConnectedToHovered ? arrowMarkerSize * 1.5 : arrowMarkerSize)}
                fill={displayColor}
                opacity={isConnectedToHovered ? 1 : 0.7}
              />
            </g>
          );
        })}

        {/* Draw nodes */}
        {nodes.map(({ id, label, x, y }) => {
          const prereqs = dagData?.nodes.find(n => n.id === id)?.prereqs || [];
          const postreqs = Array.from(edgesMap?.get(id) || new Set());
          
          // Check if this node is directly connected to hovered node
          const isDirectlyConnected = hoveredNodeId && (postreqs.includes(hoveredNodeId) || reverseEdgesMap?.get(id)?.has(hoveredNodeId));
          
          return (
            <g key={id}>
              <rect
                x={x - nodeW / 2}
                y={y - nodeH / 2}
                width={nodeW}
                height={nodeH}
                fill={hoveredNodeId === id ? "#e0f2fe" : isDirectlyConnected ? "#dbeafe" : "white"}
                stroke={hoveredNodeId === id ? "#0284c7" : isDirectlyConnected ? "#0284c7" : "#60a5fa"}
                strokeWidth={hoveredNodeId === id ? 2.5 : isDirectlyConnected ? 2 : strokeWidth}
                rx={strokeWidth * 2}
                onMouseEnter={(e) => {
                  setHoveredNodeId(id);
                  // Position in bottom right - no need to calculate, fixed positioning will handle it
                  setHoverPos({ x: 0, y: 0 }); // Dummy values, will use fixed positioning
                }}
                onMouseLeave={() => {
                  setHoveredNodeId(null);
                  setHoverPos(null);
                }}
                style={{ cursor: "pointer" }}
              />
              <text
                x={x}
                y={y + nodeFontSize / 3}
                textAnchor="middle"
                fontSize={nodeFontSize}
                fill="#1e40af"
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

      {hoveredNodeId && hoverPos && (
        <div
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            background: "white",
            border: "2px solid #0284c7",
            borderRadius: "8px",
            padding: "12px",
            fontSize: "12px",
            zIndex: 1000,
            minWidth: "200px",
            maxWidth: "250px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "8px", color: "#1e40af", fontSize: "14px" }}>
            {hoveredNodeId}
          </div>
          <div style={{ fontSize: "11px", marginBottom: "8px", color: "#0c4a6e", fontStyle: "italic" }}>
            {dagData?.nodes.find(n => n.id === hoveredNodeId)?.title || dagData?.nodes.find(n => n.id === hoveredNodeId)?.label}
          </div>
          
          <div style={{ marginBottom: "8px" }}>
            <div style={{ fontWeight: "600", color: "#0c4a6e", marginBottom: "4px" }}>
              Prerequisites:
            </div>
            <div style={{ paddingLeft: "8px", color: "#475569" }}>
              {(reverseEdgesMap?.get(hoveredNodeId!) as Set<string> | undefined)?.size === 0 ? (
                <span>None</span>
              ) : (
                Array.from(reverseEdgesMap?.get(hoveredNodeId!) as Set<string> | Set<unknown>).map((prereq: string | unknown) => (
                  <div key={prereq as string}>• {String(prereq)}</div>
                ))
              )}
            </div>
          </div>
          
          <div>
            <div style={{ fontWeight: "600", color: "#0c4a6e", marginBottom: "4px" }}>
              Postrequisites:
            </div>
            <div style={{ paddingLeft: "8px", color: "#475569" }}>
              {(edgesMap?.get(hoveredNodeId!) as Set<string> | undefined)?.size === 0 ? (
                <span>None</span>
              ) : (
                Array.from(edgesMap?.get(hoveredNodeId!) as Set<string> | Set<unknown>).map((postreq: string | unknown) => (
                  <div key={postreq as string}>• {String(postreq)}</div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
