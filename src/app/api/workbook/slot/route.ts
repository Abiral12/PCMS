import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import WorkbookDay from "@/models/WorkbookDay";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function PUT(req: NextRequest) {
  try {
    await dbConnect();

    const employeeIdHeader = req.headers.get("x-employee-id");
    if (!employeeIdHeader) return bad("Missing x-employee-id header", 401);
    if (!mongoose.Types.ObjectId.isValid(employeeIdHeader)) return bad("Invalid employee id", 400);
    const employeeId = new mongoose.Types.ObjectId(employeeIdHeader);

    const body = await req.json().catch(() => null);
    if (!body) return bad("Invalid JSON body");

    const { date, sessionCheckIn, sessionCheckOut, slotStart, slotEnd, text } = body as {
      date: string;
      sessionCheckIn: string;
      sessionCheckOut: string | null;
      slotStart: string;
      slotEnd: string;
      text: string;
    };

    if (!date) return bad("date is required");
    if (!sessionCheckIn) return bad("sessionCheckIn is required");
    if (!slotStart) return bad("slotStart is required");
    if (!slotEnd) return bad("slotEnd is required");

    const ci = new Date(sessionCheckIn);
    const co = sessionCheckOut ? new Date(sessionCheckOut) : null;
    const st = new Date(slotStart);
    const en = new Date(slotEnd);

    if (Number.isNaN(ci.getTime())) return bad("Invalid sessionCheckIn");
    if (co && Number.isNaN(co.getTime())) return bad("Invalid sessionCheckOut");
    if (Number.isNaN(st.getTime())) return bad("Invalid slotStart");
    if (Number.isNaN(en.getTime())) return bad("Invalid slotEnd");

    // 1) Find or create day
    let day: any = await WorkbookDay.findOne({ employeeId, date });
    if (!day) {
      day = await WorkbookDay.create({
        employeeId,
        date,
        todos: [],
        sessions: [],
        notes: "",
      });
    }

    // IMPORTANT: protect legacy docs (sessions missing)
    if (!Array.isArray(day.sessions)) day.sessions = [];

    // 2) Find or create session
    let session: any =
      day.sessions.find((s: any) => new Date(s.checkIn).getTime() === ci.getTime()) ?? null;

    if (!session) {
      day.sessions.push({
        checkIn: ci,
        checkOut: co,
        slots: [],
      });
      session = day.sessions[day.sessions.length - 1];
    } else {
      if (!Array.isArray(session.slots)) session.slots = []; // protect legacy session objects

      // sync checkout
      if (co && (!session.checkOut || new Date(session.checkOut).getTime() !== co.getTime())) {
        session.checkOut = co;
      }
    }

    if (!Array.isArray(session.slots)) session.slots = [];

    // 3) Find or create slot
    let slot: any =
      session.slots.find((sl: any) => new Date(sl.start).getTime() === st.getTime()) ?? null;

    if (!slot) {
      session.slots.push({
        start: st,
        end: en,
        text: (text ?? "").toString(),
      });
    } else {
      slot.end = en;
      slot.text = (text ?? "").toString();
    }

    day.markModified("sessions");
    await day.save();

    return NextResponse.json({ ok: true, day });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
