import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";

import PayrollProfile from "@/models/PayrollProfile";
import PayrollAdvance from "@/models/PayrollAdvance";

// IMPORTANT: adjust import if your model name/path differs
import Attendance from "@/models/Attendance";

import {
  ymdFromDateNPT,
  addDaysYMD,
  dayOfWeekFromYMD,
  ymdToUTCStartOfDay,
  roundPerDay,
} from "@/lib/payroll/nepalDate";

export const runtime = "nodejs";

type PayrollProfileLean = {
  baseSalary: number;
  cycleDays: number;
  effectiveFrom: Date;
  excludeWeekdays?: number[];
  perDayRounding?: "none" | "floor" | "round" | "ceil";
  lastPaidThrough?: Date | null;
};

export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const url = new URL(req.url);
    const employeeId = url.searchParams.get("employeeId");
    if (!employeeId) {
      return NextResponse.json({ success: false, error: "employeeId is required" }, { status: 400 });
    }

    const profile = await PayrollProfile.findOne({ employeeId }).lean<PayrollProfileLean>();
    if (!profile) {
      return NextResponse.json({ success: false, error: "No payroll profile for this employee" }, { status: 404 });
    }

    const baseSalary: number = profile.baseSalary;
    const cycleDays: number = profile.cycleDays;
    const excludeWeekdays: number[] = Array.isArray(profile.excludeWeekdays) ? profile.excludeWeekdays : [6];
    const perDayRounding: "none" | "floor" | "round" | "ceil" = profile.perDayRounding ?? "round";

    // Determine periodStart (NPT YMD)
    const lastPaidThrough: Date | null = profile.lastPaidThrough ?? null;
    const effectiveFrom: Date = profile.effectiveFrom;

    const startYMD = lastPaidThrough
      ? addDaysYMD(ymdFromDateNPT(new Date(lastPaidThrough)), 1)
      : ymdFromDateNPT(new Date(effectiveFrom));

    const endYMD = addDaysYMD(startYMD, cycleDays - 1);

    // Query attendance within [start..end+1) in UTC instants
    const startUTC = ymdToUTCStartOfDay(startYMD);
    const endUTCExclusive = ymdToUTCStartOfDay(addDaysYMD(endYMD, 1));

    // Attendance docs assumed: { employeeId, type, timestamp }
    const logs = await Attendance.find({
      employeeId,
      timestamp: { $gte: startUTC, $lt: endUTCExclusive },
    })
      .select({ timestamp: 1 })
      .lean();

    // Build set of days (NPT YMD) that have any attendance log
    const presentDays = new Set<string>();
    for (const r of logs) {
      presentDays.add(ymdFromDateNPT(new Date(r.timestamp)));
    }

    // Count absent (skip excluded weekdays like Saturday)
    let absentDays = 0;
    const workingDays: string[] = [];

    for (let i = 0; i < cycleDays; i++) {
      const day = addDaysYMD(startYMD, i);
      const dow = dayOfWeekFromYMD(day);
      if (excludeWeekdays.includes(dow)) continue; // Saturday skip
      workingDays.push(day);
      if (!presentDays.has(day)) absentDays += 1;
    }

    const perDayRaw = baseSalary / cycleDays;
    const perDay = roundPerDay(perDayRaw, perDayRounding);

    const absentDeduction = absentDays * perDay;

    // Load open advances
    const advances = await PayrollAdvance.find({ employeeId, status: "open" })
      .sort({ createdAt: 1 })
      .lean();

    const openAdvanceTotal = advances.reduce((sum: number, a: any) => sum + (Number(a.amount) || 0), 0);

    // Recommend applying advances up to available net (before advances)
    const availableBeforeAdvance = Math.max(0, baseSalary - absentDeduction);
    const recommendedAdvanceApply = Math.min(openAdvanceTotal, availableBeforeAdvance);

    const netPay = Math.max(0, baseSalary - absentDeduction - recommendedAdvanceApply);

    return NextResponse.json({
      success: true,
      preview: {
        employeeId,
        periodStart: startYMD,
        periodEnd: endYMD,
        baseSalary,
        cycleDays,
        perDay,
        excludeWeekdays,
        workingDaysCount: workingDays.length,
        absentDays,
        absentDeduction,
        openAdvancesCount: advances.length,
        openAdvanceTotal,
        recommendedAdvanceApply,
        netPay,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to preview payroll" },
      { status: 500 }
    );
  }
}

