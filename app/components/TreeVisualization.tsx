"use client";

import { useEffect, useMemo, useState } from "react";

interface TreeVisualizationProps {
  department: string;
}

interface Course {
  id: string;
  label: string;
  prereqs: string[];
}

interface DagData {
  nodes: Course[];
  edges: Array<{ parent: string; children: string[] }>;
}

export const TreeVisualization: React.FC<TreeVisualizationProps> = ({ department }) => {
  const [dagData, setDagData] = useState<DagData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const blockingNodes = findBlockingNodes(x1, y1, x2, y2, obstacles, startNodeId, endNodeId);

      if (blockingNodes.length === 0) {
        return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
      }

      // Calculate bulge amount based on blocking nodes
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;

      // Determine bulge direction: perpendicular to the line
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const perpX = -dy / len;
      const perpY = dx / len;

      // Calculate bulge amount from node positions
      let bulgeDistance = 0;
      for (const node of blockingNodes) {
        const distToCenter = Math.sqrt(
          (node.x - midX) * (node.x - midX) +
            (node.y - midY) * (node.y - midY)
        );
        const nodeSize = Math.max(node.w, node.h) / 2;
        bulgeDistance = Math.max(bulgeDistance, nodeSize + 40);
      }

      // Create control point for Bezier curve that bulges around obstacles
      const cp1X = midX + perpX * bulgeDistance;
      const cp1Y = midY + perpY * bulgeDistance;

      // Return waypoints for multi-segment curve
      return [
        { x: x1, y: y1 },
        { x: cp1X, y: cp1Y },
        { x: x2, y: y2 },
      ];
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

        edgeLines.push({ waypoints });
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
    };
  }, [dagData]);

  if (loading) {
    return <div className="text-gray-600 p-4">Loading...</div>;
  }

  if (error) {
    return <div className="text-red-600 p-4">Error: {error}</div>;
  }

  if (!layout) {
    return <div className="text-gray-600 p-4">No courses to display</div>;
  }

  const { nodes, edges, totalWidth, totalHeight, nodeW, nodeH, nodeFontSize, strokeWidth, arrowMarkerSize } = layout;

  return (
    <div className="w-full bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
      <svg
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        width="100%"
        height={`${totalHeight + 40}px`}
        style={{ display: "block", overflow: "visible", maxWidth: "100%" }}
      >
        <defs>
          {/* Arrowheads are now drawn manually for proper rotation along curved edges */}
        </defs>

        {/* Draw edges */}
        {edges.map((edge, idx) => {
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

          if (edge.waypoints.length === 2) {
            // Direct path, use simple Bezier curve
            const x1 = edge.waypoints[0].x;
            const y1 = edge.waypoints[0].y;
            const x2 = edge.waypoints[1].x;
            const y2 = edge.waypoints[1].y;
            const midY = (y1 + y2) / 2;
            const pathData = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
            // Vertical arrowheads
            const angle = Math.PI / 2;

            return (
              <g key={`edge-${idx}`}>
                <path
                  d={pathData}
                  fill="none"
                  stroke={edgeColor}
                  strokeWidth={strokeWidth}
                  opacity="0.7"
                />
                <polygon
                  points={createArrowhead(x2, y2, angle, arrowMarkerSize)}
                  fill={edgeColor}
                  opacity="0.7"
                />
              </g>
            );
          }

          // Path with bulge around obstacles
          const x1 = edge.waypoints[0].x;
          const y1 = edge.waypoints[0].y;
          const cpX = edge.waypoints[1].x;
          const cpY = edge.waypoints[1].y;
          const x2 = edge.waypoints[2].x;
          const y2 = edge.waypoints[2].y;

          // Use cubic Bezier curve for smooth bulge
          const pathData = `M ${x1} ${y1} C ${x1} ${cpY}, ${cpX} ${y1}, ${cpX} ${cpY} C ${cpX} ${y2}, ${x2} ${cpY}, ${x2} ${y2}`;
          // Vertical arrowheads
          const angle = Math.PI / 2;

          return (
            <g key={`edge-${idx}`}>
              <path
                d={pathData}
                fill="none"
                stroke={edgeColor}
                strokeWidth={strokeWidth}
                opacity="0.7"
              />
              <polygon
                points={createArrowhead(x2, y2, angle, arrowMarkerSize)}
                fill={edgeColor}
                opacity="0.7"
              />
            </g>
          );
        })}

        {/* Draw nodes */}
        {nodes.map(({ id, label, x, y }) => (
          <g key={id}>
            <rect
              x={x - nodeW / 2}
              y={y - nodeH / 2}
              width={nodeW}
              height={nodeH}
              fill="white"
              stroke="#60a5fa"
              strokeWidth={strokeWidth}
              rx={strokeWidth * 2}
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
        ))}
      </svg>
    </div>
  );
};
