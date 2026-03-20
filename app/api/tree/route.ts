import { buildCourseDag } from "@/app/utils/buildCourseDag";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const department = searchParams.get("department");

    if (!department) {
      return NextResponse.json(
        { error: "Department required" },
        { status: 400 }
      );
    }

    const { nodes, edges } = buildCourseDag(department);
    
    return NextResponse.json({
      nodes: Array.from(nodes.values()),
      edges: Array.from(edges.entries()).map(([parent, children]) => ({
        parent,
        children: Array.from(children),
      })),
    });
  } catch (error) {
    console.error("Error building DAG:", error);
    return NextResponse.json(
      { error: "Failed to load tree data" },
      { status: 500 }
    );
  }
}
