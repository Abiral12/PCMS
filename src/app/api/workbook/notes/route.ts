import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import WorkbookDay from "@/models/WorkbookDay";
import { getEmployeeObjectId, isValidYMD } from "@/lib/workbookAuth";

export async function PUT(req: NextRequest) {
  try {
    await dbConnect();
    const employeeId = getEmployeeObjectId(req);

    const { date, notes } = await req.json();
    if (!isValidYMD(date)) {
      return NextResponse.json({ error: "date invalid" }, { status: 400 });
    }

    const v = typeof notes === "string" ? notes : "";

    const day = await WorkbookDay.findOneAndUpdate(
      { employeeId, date },
      { $setOnInsert: { employeeId, date }, $set: { notes: v } },
      { upsert: true, new: true }
    ).lean();

    return NextResponse.json({ ok: true, day });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
