import { getAvailableDepartments } from "@/app/utils/prerequisiteTree";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const departments = getAvailableDepartments();
    return NextResponse.json(departments);
  } catch (error) {
    console.error("Error fetching departments:", error);
    return NextResponse.json(
      { error: "Failed to fetch departments" },
      { status: 500 }
    );
  }
}
