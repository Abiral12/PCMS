import { NextRequest, NextResponse } from "next/server";
import { computeAttendanceSummary, parseYMD } from "@/lib/adminAttendanceSummary";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const from = parseYMD(searchParams.get("from"));
    const to = parseYMD(searchParams.get("to"));
    const tz = searchParams.get("tz") || "Asia/Kathmandu";
    const employeeId = searchParams.get("employeeId") || "";
    const closeOpenAt = (searchParams.get("closeOpenAt") || "now") as "now" | "endOfDay";

    if (!from || !to) {
      return NextResponse.json(
        { success: false, error: "from/to (YYYY-MM-DD) are required" },
        { status: 400 }
      );
    }

    const data = await computeAttendanceSummary({ from, to, tz, employeeId, closeOpenAt });

    return NextResponse.json({ success: true, ...data });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to compute summary" },
      { status: 500 }
    );
  }
}
