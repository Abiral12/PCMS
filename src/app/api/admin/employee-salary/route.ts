import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Employee from "@/models/Employee";
import EmployeeSalary from "@/models/EmployeeSalary";

export const runtime = "nodejs";

function parseDate(d: any) {
  const dt = d ? new Date(d) : new Date();
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");

    // If employeeId provided -> return one
    if (employeeId) {
      const salary = await EmployeeSalary.findOne({ employeeId }).lean();
      return NextResponse.json({ success: true, salary: salary || null });
    }

    // else return all salary docs (for admin listing)
    const salaries = await EmployeeSalary.find({}).lean();
    return NextResponse.json({ success: true, salaries });
  } catch (error: any) {
    console.error("GET employee-salary error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error: " + error.message },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();

    const { employeeId, amount, currency = "NPR", frequency = "monthly", effectiveFrom, note } = body || {};
    if (!employeeId) {
      return NextResponse.json({ success: false, error: "employeeId is required" }, { status: 400 });
    }

    const emp = await Employee.findById(employeeId).select("_id isActive").lean();
    if (!emp || emp.isActive === false) {
      return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
    }

    const nAmount = Number(amount);
    if (!Number.isFinite(nAmount) || nAmount < 0) {
      return NextResponse.json({ success: false, error: "Invalid salary amount" }, { status: 400 });
    }

    const allowed = new Set(["monthly", "weekly", "daily", "hourly"]);
    if (!allowed.has(String(frequency))) {
      return NextResponse.json({ success: false, error: "Invalid salary frequency" }, { status: 400 });
    }

    const eff = parseDate(effectiveFrom);
    if (!eff) {
      return NextResponse.json({ success: false, error: "Invalid effectiveFrom" }, { status: 400 });
    }

    // Load old salary (if exists) to push into history only when changing
    const existing = await EmployeeSalary.findOne({ employeeId });

    const updateOps: any = {
      $set: {
        employeeId,
        amount: nAmount,
        currency: String(currency || "NPR").trim() || "NPR",
        frequency: String(frequency),
        effectiveFrom: eff,
      },
      $setOnInsert: { history: [] },
    };

    if (existing) {
      const isChanging =
        existing.amount !== nAmount ||
        existing.currency !== updateOps.$set.currency ||
        existing.frequency !== updateOps.$set.frequency ||
        new Date(existing.effectiveFrom).getTime() !== eff.getTime();

      if (isChanging) {
        updateOps.$push = {
          history: {
            amount: existing.amount,
            currency: existing.currency,
            frequency: existing.frequency,
            effectiveFrom: existing.effectiveFrom,
            note: typeof note === "string" && note.trim() ? note.trim() : "Updated via Admin UI",
          },
        };
      }
    }

    const saved = await EmployeeSalary.findOneAndUpdate(
      { employeeId },
      updateOps,
      { upsert: true, new: true, runValidators: true }
    ).lean();

    return NextResponse.json({ success: true, salary: saved });
  } catch (error: any) {
    console.error("PUT employee-salary error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error: " + error.message },
      { status: 500 }
    );
  }
}
