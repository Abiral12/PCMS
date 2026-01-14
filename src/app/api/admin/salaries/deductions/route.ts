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

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();

    const employeeId = body?.employeeId;
    if (!employeeId) {
      return NextResponse.json({ success: false, error: "employeeId is required" }, { status: 400 });
    }

    const date = parseDate(body?.date);
    if (!date) {
      return NextResponse.json({ success: false, error: "date is required (valid date)" }, { status: 400 });
    }

    const amount = safeNum(body?.amount);
    if (amount <= 0) {
      return NextResponse.json({ success: false, error: "amount must be > 0" }, { status: 400 });
    }

    const reason = String(body?.reason || "");

    const updated = await SalaryProfile.findOneAndUpdate(
      { employeeId },
      {
        $push: { deductions: { date, reason, amount, createdAt: new Date() } },
        $set: { updatedAt: new Date() },
        $setOnInsert: { employeeId, baseMonthly: 0, effectiveFrom: new Date() },
      },
      { upsert: true, new: true }
    ).lean();

    return NextResponse.json({ success: true, profile: updated });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to add deduction" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();

    const employeeId = body?.employeeId;
    const deductionId = body?.deductionId;

    if (!employeeId || !deductionId) {
      return NextResponse.json(
        { success: false, error: "employeeId and deductionId are required" },
        { status: 400 }
      );
    }

    const updated = await SalaryProfile.findOneAndUpdate(
      { employeeId },
      { $pull: { deductions: { _id: deductionId } }, $set: { updatedAt: new Date() } },
      { new: true }
    ).lean();

    return NextResponse.json({ success: true, profile: updated });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to remove deduction" },
      { status: 500 }
    );
  }
}
