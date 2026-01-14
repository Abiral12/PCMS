// app/api/admin/payroll/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";

import Employee from "@/models/Employee";
import WorkbookDay from "@/models/WorkbookDay";
import SalaryProfile from "@/models/SalaryProfile";

// IMPORTANT: rename this import to match your actual attendance model
import Attendance from "@/models/Attendance";

export const runtime = "nodejs";

/* ======================= Helpers ======================= */

function isYMD(s: string | null) {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Excel: max 31 chars, cannot contain: : \ / ? * [ ]
function clampSheetName(name: string) {
  const cleaned = (name || "Employee")
    .replace(/[:\\/?*\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const base = cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned;
  return base || "Employee";
}

function uniqueSheetName(wb: ExcelJS.Workbook, desired: string) {
  const base = clampSheetName(desired);
  let name = base;
  let i = 2;
  while (wb.getWorksheet(name)) {
    const suffix = ` ${i}`;
    name = (base.slice(0, 31 - suffix.length) + suffix).trim();
    i++;
  }
  return name;
}

function sumProfileDeductions(sp: any, from: string, to: string) {
  const list = Array.isArray(sp?.deductions) ? sp.deductions : [];
  const start = new Date(from + "T00:00:00.000Z").getTime();
  const end = new Date(to + "T23:59:59.999Z").getTime();

  return list.reduce((acc: number, d: any) => {
    const t = new Date(d?.date).getTime();
    const amt = num(d?.amount);
    if (!Number.isFinite(t) || amt <= 0) return acc;
    if (t >= start && t <= end) return acc + amt;
    return acc;
  }, 0);
}

function toYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Inclusive date range (YMD list)
function listDays(fromYMD: string, toYMDStr: string) {
  const days: string[] = [];
  const [fy, fm, fd] = fromYMD.split("-").map(Number);
  const [ty, tm, td] = toYMDStr.split("-").map(Number);

  const start = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
  const end = new Date(ty, tm - 1, td, 0, 0, 0, 0);

  const cur = new Date(start);
  while (cur <= end) {
    days.push(toYMD(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// Nepal time formatting
const TIMEZONE = "Asia/Kathmandu";

function fmtTime(d: Date | null) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

function hoursBetween(a: Date | null, b: Date | null) {
  if (!a || !b) return 0;
  const ms = b.getTime() - a.getTime();
  if (ms <= 0) return 0;
  return Math.round((ms / 36e5) * 100) / 100; // 2 decimals
}

function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(v: any) {
  return Math.round(num(v) * 100) / 100;
}

/* ================= Salary adjustments / deductions / advance / paid ================= */

const ADJ_COLLECTION = process.env.PAYROLL_ADJ_COLLECTION || "salary_transactions";

type AdjType = "deduction" | "advance" | "bonus" | "paid" | "other";
type AdjRow = {
  employeeId: string;
  ymd: string;
  type: AdjType;
  amount: number;
  note: string;
};

function normalizeAdjType(raw: any): AdjType {
  const t = String(raw || "").toLowerCase().trim();
  if (t.includes("deduct")) return "deduction";
  if (t.includes("advance")) return "advance";
  if (t.includes("bonus") || t.includes("incentive")) return "bonus";
  if (t.includes("paid") || t.includes("payment") || t.includes("salary_paid")) return "paid";
  return "other";
}

function ymdFromAny(doc: any): string | null {
  // Prefer explicit YMD string
  if (doc?.date && typeof doc.date === "string" && isYMD(doc.date)) return doc.date;

  // Or timestamp/date object
  const ts = doc?.timestamp || doc?.createdAt || doc?.paidAt || doc?.date;
  if (ts) {
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(d); // YYYY-MM-DD
    }
  }
  return null;
}

async function loadAdjustments(params: {
  from: string;
  to: string;
  startDate: Date;
  endDate: Date;
  employeeIds: string[];
}): Promise<Map<string, AdjRow[]>> {
  const { from, to, startDate, endDate, employeeIds } = params;

  const db = mongoose.connection?.db;
  if (!db) return new Map();

  const col = db.collection(ADJ_COLLECTION);

  const empObjectIds = employeeIds
    .map((id) => {
      try {
        return new mongoose.Types.ObjectId(id);
      } catch {
        return null;
      }
    })
    .filter(Boolean) as mongoose.Types.ObjectId[];

  const filter: any = {
    $and: [
      {
        $or: [
          { employeeId: { $in: employeeIds } },
          empObjectIds.length ? { employeeId: { $in: empObjectIds } } : null,
        ].filter(Boolean),
      },
      {
        // match either YMD string date field OR date/timestamp-based field
        $or: [
          // date stored as string YYYY-MM-DD
          { date: { $gte: from, $lte: to } },

          // date stored as Date object
          { date: { $gte: startDate, $lte: endDate } },

          { timestamp: { $gte: startDate, $lte: endDate } },
          { createdAt: { $gte: startDate, $lte: endDate } },
          { paidAt: { $gte: startDate, $lte: endDate } },
        ],
      },
    ],
  };

  const docs = await col
    .find(filter)
    .project({
      employeeId: 1,
      date: 1,
      timestamp: 1,
      createdAt: 1,
      paidAt: 1,
      type: 1,
      kind: 1,
      category: 1,
      amount: 1,
      value: 1,
      note: 1,
      remarks: 1,
      description: 1,
      title: 1,
    })
    .toArray();

  const map = new Map<string, AdjRow[]>();

  for (const doc of docs as any[]) {
    const empId = String(doc.employeeId);
    const ymd = ymdFromAny(doc);
    if (!ymd) continue;

    const type = normalizeAdjType(doc.type ?? doc.kind ?? doc.category);
    const amount = num(doc.amount ?? doc.value);
    const note = String(doc.note ?? doc.remarks ?? doc.description ?? doc.title ?? "");

    const row: AdjRow = { employeeId: empId, ymd, type, amount, note };
    const arr = map.get(empId) || [];
    arr.push(row);
    map.set(empId, arr);
  }

  for (const [k, arr] of map.entries()) {
    arr.sort((a, b) => (a.ymd < b.ymd ? -1 : a.ymd > b.ymd ? 1 : 0));
    map.set(k, arr);
  }

  return map;
}

/* ======================= Route ======================= */

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const minHoursParam = url.searchParams.get("minHours");
  const minHoursRaw = Number(minHoursParam);
  const minHours = Number.isFinite(minHoursRaw) ? Math.max(0, minHoursRaw) : 6;

  if (!isYMD(from) || !isYMD(to)) {
    return NextResponse.json(
      { error: "Invalid date range. Use ?from=YYYY-MM-DD&to=YYYY-MM-DD" },
      { status: 400 }
    );
  }
  // Safe to assert now because isYMD guards null/format issues
  const fromYMD = from as string;
  const toYMD = to as string;

  if (fromYMD > toYMD) {
    return NextResponse.json(
      { error: "Invalid date range: from must be <= to" },
      { status: 400 }
    );
  }

  await dbConnect();

  const employees = await Employee.find({})
    .select("_id name email department role position")
    .lean();

  const days = listDays(fromYMD, toYMD);

  // Attendance date range
  const startDate = new Date(fromYMD + "T00:00:00.000Z");
  const endDate = new Date(toYMD + "T23:59:59.999Z");

  // Salary Profiles
  const empObjectIds = (employees as any[]).map((e) => e._id);
  const salaryProfiles = await SalaryProfile.find({ employeeId: { $in: empObjectIds } })
    .select("employeeId payType baseMonthly hourlyRate overtimeRate standardHoursPerDay allowances deductions notes")
    .lean();

  const salaryByEmpId = new Map<string, any>();
  for (const sp of salaryProfiles as any[]) {
    salaryByEmpId.set(String(sp.employeeId), sp);
  }

  // Pull attendance logs
  const allAttendance = await Attendance.find({
    timestamp: { $gte: startDate, $lte: endDate },
  })
    .select("employeeId type timestamp")
    .lean();

  // Pull workbooks (WorkbookDay.date is YMD string)
  const allWorkbooks = await WorkbookDay.find({
    date: { $gte: fromYMD, $lte: toYMD },
  })
    .select("employeeId date hourlyLogs logs items notes")
    .lean();

  // Index attendance by employeeId__ymd
  const attIndex = new Map<string, { checkins: Date[]; checkouts: Date[] }>();
  for (const row of allAttendance as any[]) {
    const empId = String(row.employeeId);
    const d = new Date(row.timestamp);
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(d);
    const key = `${empId}__${ymd}`;
    const cur = attIndex.get(key) || { checkins: [], checkouts: [] };
    if (row.type === "checkin") cur.checkins.push(d);
    if (row.type === "checkout") cur.checkouts.push(d);
    attIndex.set(key, cur);
  }

  // Index workbook by employeeId__ymd
  const wbIndex = new Map<string, any>();
  for (const w of allWorkbooks as any[]) {
    const key = `${String(w.employeeId)}__${w.date}`;
    wbIndex.set(key, w);
  }

  // Load salary adjustments / deductions / advances / paid within period
  const employeeIds = (employees as any[]).map((e) => String(e._id));
  const adjMap = await loadAdjustments({ from: fromYMD, to: toYMD, startDate, endDate, employeeIds });

  // Aggregate totals per employee
  const adjTotals = new Map<
    string,
    { deduction: number; advance: number; bonus: number; paid: number; other: number }
  >();

  for (const empId of employeeIds) {
    const rows = adjMap.get(empId) || [];
    const t = { deduction: 0, advance: 0, bonus: 0, paid: 0, other: 0 };
    for (const r of rows) {
      if (r.type === "deduction") t.deduction += num(r.amount);
      else if (r.type === "advance") t.advance += num(r.amount);
      else if (r.type === "bonus") t.bonus += num(r.amount);
      else if (r.type === "paid") t.paid += num(r.amount);
      else t.other += num(r.amount);
    }
    adjTotals.set(empId, t);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Office Management System";
  wb.created = new Date();

  /* ======================= Summary sheet ======================= */
  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { header: "Employee", key: "employee", width: 28 },
    { header: "Position", key: "position", width: 18 },
    { header: "Department", key: "department", width: 18 },

    { header: "Valid Days", key: "validDays", width: 12 },
    { header: "Total Hours", key: "totalHours", width: 12 },
    { header: "Overtime Hours", key: "overtimeHours", width: 14 },
    { header: "Avg Hours/Valid Day", key: "avgHours", width: 18 },

    { header: "Rate Type", key: "rateType", width: 14 },
    { header: "Rate", key: "rate", width: 12 },

    { header: "Allowances", key: "allowances", width: 12 },
    { header: "Profile Deductions", key: "profileDeductions", width: 18 },

    { header: "Gross Pay", key: "grossPay", width: 14 },
    { header: "Bonus", key: "bonus", width: 12 },
    { header: "Adj. Deductions", key: "deductions", width: 14 },
    { header: "Advance", key: "advance", width: 12 },
    { header: "Paid", key: "paid", width: 12 },

    { header: "Net Pay", key: "netPay", width: 14 },
    { header: "Balance", key: "balance", width: 14 },
  ];
  summary.getRow(1).font = { bold: true };
  summary.views = [{ state: "frozen", ySplit: 1 }];

  /* ======================= Employee sheets ======================= */
  for (const emp of employees as any[]) {
    const empId = String(emp._id);
    const empName = emp.name || "Employee";
    const position = emp.position || "";
    const dept = emp.department || "";

    const sp = salaryByEmpId.get(empId);

    // SalaryProfile-based rate
    let rateType: "hourly" | "monthly" | "unknown" = "unknown";
    let rate = 0;

    const payType = String(sp?.payType || "").toLowerCase(); // "monthly" | "hourly"
    const baseMonthly = num(sp?.baseMonthly);
    const hourlyRate = num(sp?.hourlyRate);
    const overtimeRate = num(sp?.overtimeRate);
    const standardHoursPerDay = Math.max(1, num(sp?.standardHoursPerDay) || 8);
    const allowances = num(sp?.allowances);
    const profileDeductions = sumProfileDeductions(sp, fromYMD, toYMD);


    if (payType === "monthly" && baseMonthly > 0) {
      rateType = "monthly";
      rate = baseMonthly;
    } else if (payType === "hourly" && hourlyRate > 0) {
      rateType = "hourly";
      rate = hourlyRate;
    }

    const sheetTitle = uniqueSheetName(wb, position ? `${empName} (${position})` : empName);
    const ws = wb.addWorksheet(sheetTitle);

    ws.columns = [
      { header: "Date", key: "date", width: 12 },
      { header: "Day", key: "day", width: 12 },
      { header: "Check-in", key: "checkin", width: 10 },
      { header: "Check-out", key: "checkout", width: 10 },
      { header: "Work Hours", key: "hours", width: 12 },
      { header: "Overtime Hours", key: "otHours", width: 14 },
      { header: "Valid Day", key: "valid", width: 10 },
      { header: "Hourly Logs Count", key: "logsCount", width: 18 },
      { header: "Notes", key: "notes", width: 30 },
    ];

    // Add top info rows
    ws.spliceRows(1, 0, []);
    ws.spliceRows(1, 0, []);
    ws.getCell("A1").value = "Employee";
    ws.getCell("B1").value = empName;
    ws.getCell("A2").value = "Period";
    ws.getCell("B2").value = `${fromYMD} → ${toYMD}`;
    ws.getCell("D1").value = "Department";
    ws.getCell("E1").value = dept;
    ws.getCell("D2").value = "Position";
    ws.getCell("E2").value = position;

    ws.getRow(1).font = { bold: true };
    ws.getRow(2).font = { bold: true };
    ws.getRow(3).font = { bold: true }; // header row now row 3

    let validDays = 0;
    let totalHours = 0;
    let overtimeHours = 0;

    for (const ymd of days) {
      const key = `${empId}__${ymd}`;

      const att = attIndex.get(key);
      const checkin = att?.checkins?.length
        ? new Date(Math.min(...att.checkins.map((d) => d.getTime())))
        : null;
      const checkout = att?.checkouts?.length
        ? new Date(Math.max(...att.checkouts.map((d) => d.getTime())))
        : null;

      const hrs = hoursBetween(checkin, checkout);
      totalHours += hrs;

      const dailyOt = rateType === "hourly" ? Math.max(0, hrs - standardHoursPerDay) : 0;
      overtimeHours += dailyOt;

      const wbd = wbIndex.get(key);
      const logsArr =
        (wbd?.hourlyLogs as any[]) ||
        (wbd?.logs as any[]) ||
        (wbd?.items as any[]) ||
        [];
      const logsCount = Array.isArray(logsArr) ? logsArr.length : 0;

      const isValid = !!checkin && !!checkout && hrs >= minHours;
      if (isValid) validDays += 1;

      const dt = new Date(ymd + "T00:00:00.000Z");
      const dayName = new Intl.DateTimeFormat("en-US", {
        timeZone: TIMEZONE,
        weekday: "short",
      }).format(dt);

      ws.addRow({
        date: ymd,
        day: dayName,
        checkin: fmtTime(checkin),
        checkout: fmtTime(checkout),
        hours: hrs || "",
        otHours: dailyOt ? round2(dailyOt) : "",
        valid: isValid ? "YES" : "NO",
        logsCount: logsCount || "",
        notes: wbd?.notes || "",
      });
    }

    // Totals row
    ws.addRow({});
    const totalsRow = ws.addRow({
      date: "TOTAL",
      hours: round2(totalHours),
      otHours: round2(overtimeHours),
      valid: validDays,
    });
    totalsRow.font = { bold: true };

    const avgHours = validDays > 0 ? totalHours / validDays : 0;

    // Gross pay (SalaryProfile)
    let grossPay = 0;

    if (rateType === "monthly") {
      // prorate monthly by valid days (your existing policy)
      grossPay = (baseMonthly / 30) * validDays;
    } else if (rateType === "hourly") {
      const regularHours = Math.max(0, totalHours - overtimeHours);
      const otRate = overtimeRate > 0 ? overtimeRate : hourlyRate;
      grossPay = regularHours * hourlyRate + overtimeHours * otRate;
    }

    // add allowances (SalaryProfile)
    grossPay += allowances;

    // Apply adjustments
    const t = adjTotals.get(empId) || {
      deduction: 0,
      advance: 0,
      bonus: 0,
      paid: 0,
      other: 0,
    };

    // Net pay includes profile deductions too
    const netPay = grossPay + t.bonus - (t.deduction + profileDeductions) - t.advance;
    const balance = netPay - t.paid;

    // Payroll block
    ws.addRow({});
    const r1 = ws.addRow({ date: "PAYROLL", day: "" });
    r1.font = { bold: true };

    const addKV = (label: string, value: any) => {
      const rr = ws.addRow({ date: label, day: String(value ?? "") });
      rr.getCell(1).font = { bold: true };
      return rr;
    };

    addKV("Rate Type", rateType);
    addKV("Pay Type (Profile)", payType || "");
    addKV("Base Monthly", round2(baseMonthly));
    addKV("Hourly Rate", round2(hourlyRate));
    addKV("Overtime Rate", round2(overtimeRate > 0 ? overtimeRate : hourlyRate));
    addKV("Standard Hours/Day", round2(standardHoursPerDay));
    addKV("Allowances", round2(allowances));
    addKV("Profile Deductions", round2(profileDeductions));

    addKV("Rate (shown in summary)", round2(rate));
    addKV("Total Hours", round2(totalHours));
    addKV("Overtime Hours", round2(overtimeHours));

    addKV("Gross Pay", round2(grossPay));
    addKV("Bonus", round2(t.bonus));
    addKV("Adj. Deductions", round2(t.deduction));
    addKV("Advance Salary", round2(t.advance));
    addKV("Paid", round2(t.paid));
    addKV("Net Pay", round2(netPay));
    addKV("Balance", round2(balance));

    // Adjustment details
    const adjRows = adjMap.get(empId) || [];
    if (adjRows.length) {
      ws.addRow({});
      const hdr = ws.addRow({ date: "ADJUSTMENTS", day: "" });
      hdr.font = { bold: true };

      const tableHeader = ws.addRow({
        date: "Date",
        day: "Type",
        checkin: "Amount",
        checkout: "Note",
      });
      tableHeader.font = { bold: true };

      for (const a of adjRows) {
        ws.addRow({
          date: a.ymd,
          day: a.type,
          checkin: round2(a.amount),
          checkout: a.note,
        });
      }
    }

    // Freeze panes: 2 info rows + header row => freeze top 3 rows
    ws.views = [{ state: "frozen", ySplit: 3 }];

    // Add to summary sheet
    summary.addRow({
      employee: empName,
      position,
      department: dept,

      validDays,
      totalHours: round2(totalHours),
      overtimeHours: round2(overtimeHours),
      avgHours: round2(avgHours),

      rateType,
      rate: round2(rate),

      allowances: round2(allowances),
      profileDeductions: round2(profileDeductions),

      grossPay: round2(grossPay),
      bonus: round2(t.bonus),
      deductions: round2(t.deduction),
      advance: round2(t.advance),
      paid: round2(t.paid),

      netPay: round2(netPay),
      balance: round2(balance),
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  const filename = `payroll_${fromYMD}_to_${toYMD}.xlsx`;

  return new NextResponse(Buffer.from(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
