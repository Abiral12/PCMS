import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";

import PayrollProfile from "@/models/PayrollProfile";
import PayrollAdvance from "@/models/PayrollAdvance";
import PayrollSlip from "@/models/PayrollSlip";
import Attendance from "@/models/Attendance";

import {
  ymdFromDateNPT,
  addDaysYMD,
  dayOfWeekFromYMD,
  ymdToUTCStartOfDay,
  roundPerDay,
} from "@/lib/payroll/nepalDate";

export const runtime = "nodejs";

async function buildPreviewForEmployee(employeeId: string, session: mongoose.ClientSession) {
  const profile: any = await PayrollProfile.findOne({ employeeId }).session(session).lean();
  if (!profile) throw new Error("No payroll profile for this employee");

  const baseSalary: number = profile.baseSalary;
  const cycleDays: number = profile.cycleDays;
  const excludeWeekdays: number[] = Array.isArray(profile.excludeWeekdays) ? profile.excludeWeekdays : [6];
  const perDayRounding: "none" | "floor" | "round" | "ceil" = profile.perDayRounding ?? "round";

  const lastPaidThrough: Date | null = profile.lastPaidThrough ?? null;
  const effectiveFrom: Date = profile.effectiveFrom;

  const startYMD = lastPaidThrough
    ? addDaysYMD(ymdFromDateNPT(new Date(lastPaidThrough)), 1)
    : ymdFromDateNPT(new Date(effectiveFrom));

  const endYMD = addDaysYMD(startYMD, cycleDays - 1);

  const startUTC = ymdToUTCStartOfDay(startYMD);
  const endUTCExclusive = ymdToUTCStartOfDay(addDaysYMD(endYMD, 1));

  const logs: any[] = await Attendance.find({
    employeeId,
    timestamp: { $gte: startUTC, $lt: endUTCExclusive },
  })
    .select({ timestamp: 1 })
    .session(session)
    .lean();

  const presentDays = new Set<string>();
  for (const r of logs) presentDays.add(ymdFromDateNPT(new Date(r.timestamp)));

  let absentDays = 0;
  for (let i = 0; i < cycleDays; i++) {
    const day = addDaysYMD(startYMD, i);
    const dow = dayOfWeekFromYMD(day);
    if (excludeWeekdays.includes(dow)) continue;
    if (!presentDays.has(day)) absentDays += 1;
  }

  const perDayRaw = baseSalary / cycleDays;
  const perDay = roundPerDay(perDayRaw, perDayRounding);
  const absentDeduction = absentDays * perDay;

  const advances: any[] = await PayrollAdvance.find({ employeeId, status: "open" })
    .sort({ createdAt: 1 })
    .session(session)
    .lean();

  const openAdvanceTotal = advances.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  const availableBeforeAdvance = Math.max(0, baseSalary - absentDeduction);
  const recommendedAdvanceApply = Math.min(openAdvanceTotal, availableBeforeAdvance);
  const netPay = Math.max(0, baseSalary - absentDeduction - recommendedAdvanceApply);

  return {
    profile,
    startYMD,
    endYMD,
    baseSalary,
    cycleDays,
    perDay,
    absentDays,
    absentDeduction,
    advances,
    recommendedAdvanceApply,
    netPay,
  };
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const url = new URL(req.url);
    const employeeId = url.searchParams.get("employeeId");

    const q: any = {};
    if (employeeId) q.employeeId = employeeId;

    const slips = await PayrollSlip.find(q).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, slips });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Failed to load slips" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  await dbConnect();

  const session = await mongoose.startSession();
  try {
    const body = await req.json().catch(() => ({}));
    const employeeId = body?.employeeId as string;
    const otherAdjustment = Number(body?.otherAdjustment || 0);
    const markPaid = Boolean(body?.markPaid);

    if (!employeeId) {
      return NextResponse.json({ success: false, error: "employeeId is required" }, { status: 400 });
    }

    let createdSlip: any = null;

    await session.withTransaction(async () => {
      const pv = await buildPreviewForEmployee(employeeId, session);

      // Apply advances oldest-first up to recommendedAdvanceApply
      let remainingToApply = pv.recommendedAdvanceApply;
      const advancesApplied: Array<{ advanceId: any; amount: number }> = [];

      for (const adv of pv.advances) {
        if (remainingToApply <= 0) break;

        const advAmount = Number(adv.amount) || 0;
        if (advAmount <= 0) continue;

        const apply = Math.min(advAmount, remainingToApply);
        if (apply > 0) {
          advancesApplied.push({ advanceId: adv._id, amount: apply });
          remainingToApply -= apply;

          // If fully applied, settle it automatically
          if (apply >= advAmount) {
            await PayrollAdvance.updateOne(
              { _id: adv._id },
              { $set: { status: "settled", settledAt: new Date() } },
              { session }
            );
          } else {
            // If you want partial repayment tracking, add remainingAmount field in your schema.
            // For now we leave it open (or you can implement remainingAmount here).
          }
        }
      }

      const advancesTotal = advancesApplied.reduce((s, x) => s + x.amount, 0);

      const netPay = Math.max(
        0,
        pv.baseSalary - pv.absentDeduction - advancesTotal + otherAdjustment
      );

      const slipDoc = {
        employeeId,
        periodStart: ymdToUTCStartOfDay(pv.startYMD),
        periodEnd: ymdToUTCStartOfDay(pv.endYMD),
        baseSalary: pv.baseSalary,
        cycleDays: pv.cycleDays,
        perDay: pv.perDay,
        absentDays: pv.absentDays,
        absentDeduction: pv.absentDeduction,
        advancesApplied,
        advancesTotal,
        otherAdjustment,
        netPay,
        status: markPaid ? "paid" : "draft",
        paidAt: markPaid ? new Date() : null,
      };

      const created = await PayrollSlip.create([slipDoc], { session });
      createdSlip = created[0];

      // Move profile lastPaidThrough to end day
      await PayrollProfile.updateOne(
        { employeeId },
        { $set: { lastPaidThrough: ymdToUTCStartOfDay(pv.endYMD) } },
        { session }
      );
    });

    return NextResponse.json({ success: true, slip: createdSlip });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Failed to create slip" }, { status: 500 });
  } finally {
    session.endSession();
  }
}
