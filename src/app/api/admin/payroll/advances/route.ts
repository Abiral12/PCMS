// app/api/admin/payroll/advances/route.ts
import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import PayrollAdvance from "@/models/PayrollAdvance";
import Employee from "@/models/Employee";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const employeeId = url.searchParams.get("employeeId");
  const status = url.searchParams.get("status"); // pending/approved/deducted/rejected
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

  await dbConnect();

  const q: any = {};
  if (employeeId) q.employeeId = employeeId;
  if (status) q.status = status;

  const items = await PayrollAdvance.find(q).sort({ date: -1, createdAt: -1 }).limit(limit).lean();
  return NextResponse.json({ success: true, items });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { employeeId, amount, reason, date, status } = body ?? {};

  if (!employeeId) {
    return NextResponse.json({ success: false, error: "employeeId is required" }, { status: 400 });
  }
  if (Number(amount ?? 0) <= 0) {
    return NextResponse.json({ success: false, error: "amount must be > 0" }, { status: 400 });
  }

  await dbConnect();

  const employee = await Employee.findById(employeeId).select("_id").lean();
  if (!employee) {
    return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
  }

  const doc = await PayrollAdvance.create({
    employeeId,
    amount: Number(amount),
    reason: String(reason ?? ""),
    date: date ? new Date(date) : new Date(),
    status: status ?? "pending",
  });

  return NextResponse.json({ success: true, item: doc });
}
