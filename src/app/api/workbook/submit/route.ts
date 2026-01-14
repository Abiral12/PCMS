// app/api/workbook/submit/route.ts
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import WorkbookDay from "@/models/WorkbookDay";

export const runtime = "nodejs";

function bad(msg: string, status = 400, extra?: any) {
  return NextResponse.json({ success: false, error: msg, ...(extra ?? {}) }, { status });
}

function ymdInTZ(tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const yyyy = parts.find((p) => p.type === "year")?.value ?? "1970";
  const mm = parts.find((p) => p.type === "month")?.value ?? "01";
  const dd = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${yyyy}-${mm}-${dd}`;
}

function getEmployeeIdHeader(req: NextRequest) {
  // support both, but prefer x-employee-id
  return req.headers.get("x-employee-id") || req.headers.get("x-user-id") || "";
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const body = await req.json().catch(() => ({}));

    // Prefer header (consistent with your other workbook routes)
    const employeeIdRaw = getEmployeeIdHeader(req) || String(body?.employeeId || "");
    const tz = String(body?.tz || "Asia/Kathmandu");

    if (!employeeIdRaw) return bad("Missing employeeId", 401);
    if (!mongoose.Types.ObjectId.isValid(employeeIdRaw)) return bad("Invalid employeeId", 400);

    const employeeId = new mongoose.Types.ObjectId(employeeIdRaw);
    const dayKey = ymdInTZ(tz);

    // IMPORTANT: your doc uses { employeeId, date }, not { employeeId, dayKey }
    const wb: any = await WorkbookDay.findOne({ employeeId, date: dayKey });
    if (!wb) return bad("Workbook not found for today.", 400);

    if (wb.submittedAt) {
      return NextResponse.json({
        success: true,
        submitted: true,
        alreadySubmitted: true,
        submittedAt: wb.submittedAt,
      });
    }

    // Validate: every slot text must be filled (sessions[].slots[])
    const sessions = Array.isArray(wb.sessions) ? wb.sessions : [];
    const missingSlots: Array<{
      sessionCheckIn: string;
      slotStart: string;
      slotEnd: string;
    }> = [];

    let totalSlots = 0;

    for (const s of sessions) {
      const ci = s?.checkIn ? new Date(s.checkIn).toISOString() : "";
      const slots = Array.isArray(s?.slots) ? s.slots : [];

      for (const sl of slots) {
        totalSlots += 1;
        const startIso = sl?.start ? new Date(sl.start).toISOString() : "";
        const endIso = sl?.end ? new Date(sl.end).toISOString() : "";
        const text = String(sl?.text ?? "").trim();

        if (!text) {
          missingSlots.push({
            sessionCheckIn: ci,
            slotStart: startIso,
            slotEnd: endIso,
          });
        }
      }
    }

    // Optional but recommended: do not allow submit if there are zero slots at all
    // (prevents "submit empty day" when nothing got saved yet)
    if (totalSlots === 0) {
      return bad(
        "No hourly slots found for today. Please add at least one hourly log before submitting.",
        400
      );
    }

    if (missingSlots.length > 0) {
      return bad(
        "All hourly logs must be filled before submitting the day.",
        400,
        { missingCount: missingSlots.length, missingSlots }
      );
    }

    wb.submittedAt = new Date();
    wb.status = "submitted"; // optional if your schema allows
    await wb.save();

    return NextResponse.json({
      success: true,
      submitted: true,
      submittedAt: wb.submittedAt,
    });
  } catch (e: any) {
    console.error("workbook submit error:", e);
    return NextResponse.json(
      { success: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
