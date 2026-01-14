import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import PayrollProfile from "@/models/PayrollProfile";

export const runtime = "nodejs";

function clampInt(n: any, min: number, max: number) {
  const v = Math.trunc(Number(n));
  if (!Number.isFinite(v)) return null;
  return Math.max(min, Math.min(max, v));
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const url = new URL(req.url);
    const employeeId = url.searchParams.get("employeeId");
    if (!employeeId) {
      return NextResponse.json({ success: false, error: "employeeId is required" }, { status: 400 });
    }

    const profile = await PayrollProfile.findOne({ employeeId }).lean();
    return NextResponse.json({ success: true, profile: profile || null });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load payroll profile" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json().catch(() => ({}));

    const employeeId = String(body?.employeeId || "").trim();
    if (!employeeId) {
      return NextResponse.json({ success: false, error: "employeeId is required" }, { status: 400 });
    }

    const baseSalary = Number(body?.baseSalary);
    if (!Number.isFinite(baseSalary) || baseSalary < 0) {
      return NextResponse.json({ success: false, error: "baseSalary must be a valid number" }, { status: 400 });
    }

    // allow 1..365 (your use-case: 24/30)
    const cycleDays = clampInt(body?.cycleDays, 1, 365);
    if (!cycleDays) {
      return NextResponse.json({ success: false, error: "cycleDays must be an integer between 1 and 365" }, { status: 400 });
    }

    const perDayRounding =
      body?.perDayRounding === "none" ||
      body?.perDayRounding === "floor" ||
      body?.perDayRounding === "round" ||
      body?.perDayRounding === "ceil"
        ? body.perDayRounding
        : "round";

    const excludeWeekdaysRaw = Array.isArray(body?.excludeWeekdays) ? body.excludeWeekdays : [6];
    const excludeWeekdays = excludeWeekdaysRaw
      .map((x: any) => clampInt(x, 0, 6))
      .filter((x: any) => typeof x === "number") as number[];

    const effectiveFrom = body?.effectiveFrom ? new Date(body.effectiveFrom) : new Date();
    if (Number.isNaN(effectiveFrom.getTime())) {
      return NextResponse.json({ success: false, error: "effectiveFrom is invalid" }, { status: 400 });
    }

    const updated = await PayrollProfile.findOneAndUpdate(
      { employeeId },
      {
        $set: {
          baseSalary,
          cycleDays,
          perDayRounding,
          excludeWeekdays,
          effectiveFrom,
        },
        $setOnInsert: {
          lastPaidThrough: null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return NextResponse.json({ success: true, profile: updated });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to save payroll profile" },
      { status: 500 }
    );
  }
}
