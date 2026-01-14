// app/api/workbook/day/route.ts
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import WorkbookDay from "@/models/WorkbookDay";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

function getEmployeeIdHeader(req: NextRequest) {
  // support both headers (your app currently uses x-user-id in many places)
  return req.headers.get("x-employee-id") || req.headers.get("x-user-id") || "";
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const employeeIdHeader = getEmployeeIdHeader(req);
    if (!employeeIdHeader) return bad("Missing employeeId header", 401);
    if (!mongoose.Types.ObjectId.isValid(employeeIdHeader)) return bad("Invalid employee id", 400);
    const employeeId = new mongoose.Types.ObjectId(employeeIdHeader);

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    if (!date) return bad("Missing date");

    const day = await WorkbookDay.findOne({ employeeId, date }).lean();
    return NextResponse.json({ day: day || null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
