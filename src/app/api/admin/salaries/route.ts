import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import SalaryProfile from "@/models/SalaryProfile";

export const runtime = "nodejs";

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(v: any): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function GET() {
  try {
    await dbConnect();
    const profiles = await SalaryProfile.find({}).lean();
    return NextResponse.json({ success: true, profiles });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load salary profiles" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();

    const employeeId = body?.employeeId;
    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: "employeeId is required" },
        { status: 400 }
      );
    }

    const effectiveFrom = parseDate(body?.effectiveFrom);
    if (!effectiveFrom) {
      return NextResponse.json(
        { success: false, error: "effectiveFrom is required (valid date)" },
        { status: 400 }
      );
    }

    const doc = {
      employeeId,
      baseMonthly: safeNum(body?.baseMonthly),
      effectiveFrom,
      notes: String(body?.notes || ""),
      updatedAt: new Date(),
    };

    // IMPORTANT: do not overwrite deductions here
    const saved = await SalaryProfile.findOneAndUpdate(
      { employeeId },
      { $set: doc, $setOnInsert: { deductions: [] } },
      { upsert: true, new: true }
    ).lean();

    return NextResponse.json({ success: true, profile: saved });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to save salary profile" },
      { status: 500 }
    );
  }
}
