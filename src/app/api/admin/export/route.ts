// app/api/admin/payroll/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import dbConnect from "@/lib/mongodb";

import Employee from "@/models/Employee";
import Attendance from "@/models/Attendance";
import SalaryProfile from "@/models/SalaryProfile";

export const runtime = "nodejs";

/* ======================= Helpers ======================= */

function isYMD(s: string | null) {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function safeText(v: any) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function pick(obj: any, keys: string[]) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return null;
}

function toDateMaybe(v: any): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toNumber(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function autoWidth(ws: ExcelJS.Worksheet, min = 10, max = 40) {
  ws.columns?.forEach((col) => {
    let width = min;
    col.eachCell?.({ includeEmpty: true }, (cell) => {
      const v = cell.value as any;
      const len = v ? String(v).length : 0;
      width = Math.max(width, Math.min(max, len + 2));
    });
    col.width = width;
  });
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", horizontal: "left" };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ws.columnCount },
  };
}

function clamp0(n: number) {
  return n < 0 ? 0 : n;
}

function safeSheetName(name: string) {
  const cleaned = (name || "Sheet")
    .replace(/[:\\/?*\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned;
}

function fmtDateTime(v: number | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString(); // stable + timezone-safe
}

function addSheetWithColumns(
  wb: ExcelJS.Workbook,
  name: string,
  columns: { header: string; key: string }[],
  note?: string
) {
  const ws = wb.addWorksheet(safeSheetName(name));
  ws.columns = columns;
  if (note) ws.addRow(Object.fromEntries([[columns[0]?.key ?? "info", note]]));
  styleHeader(ws);
  autoWidth(ws, 10, 30);
  return ws;
}

/**
 * Attendance day logic (schema-tolerant):
 * - We group by (employeeId + day)
 * - A day is "valid" if it has BOTH a check-in and check-out time.
 * - Otherwise "invalid".
 * - Work hours for the day:
 *   - Prefer numeric hours field if provided
 *   - Else compute from (checkOut - checkIn) in hours
 */
type DayAgg = {
  hasIn: boolean;
  hasOut: boolean;
  inTs: number | null; // earliest check-in timestamp (ms)
  outTs: number | null; // latest check-out timestamp (ms)
  hoursFromField: number | null; // max hours field found in docs for that day
  overtimeHoursField: number | null;
  advanceField: number | null;
};

function getDayKeyFromAttendance(a: any): string | null {
  const dateStr = pick(a, ["date", "day"]); // often "YYYY-MM-DD"
  if (typeof dateStr === "string" && isYMD(dateStr)) return dateStr;

  const ts = toDateMaybe(pick(a, ["timestamp", "time", "createdAt", "updatedAt"]));
  if (ts) return ymd(ts);

  return null;
}

function detectInOut(a: any) {
  const t = String(pick(a, ["type", "eventType", "action"]) ?? "").toLowerCase();

  const isInByType = ["checkin", "check-in", "in"].includes(t);
  const isOutByType = ["checkout", "check-out", "out"].includes(t);

  const hasCheckInField = !!pick(a, ["checkIn", "check_in", "checkInTime", "check_in_time"]);
  const hasCheckOutField = !!pick(a, ["checkOut", "check_out", "checkOutTime", "check_out_time"]);

  return {
    isIn: isInByType || (hasCheckInField && !hasCheckOutField),
    isOut: isOutByType || (hasCheckOutField && !hasCheckInField),
    hasCheckInField,
    hasCheckOutField,
  };
}

function extractCheckInOutTimestamps(a: any): { inDt: Date | null; outDt: Date | null } {
  const inVal = pick(a, ["checkIn", "check_in", "checkInTime", "check_in_time"]);
  const outVal = pick(a, ["checkOut", "check_out", "checkOutTime", "check_out_time"]);

  return {
    inDt: toDateMaybe(inVal),
    outDt: toDateMaybe(outVal),
  };
}

function computeDayHours(agg: DayAgg): number | null {
  if (typeof agg.hoursFromField === "number" && Number.isFinite(agg.hoursFromField)) {
    return clamp0(agg.hoursFromField);
  }
  if (agg.inTs && agg.outTs && agg.outTs > agg.inTs) {
    const diffHours = (agg.outTs - agg.inTs) / (1000 * 60 * 60);
    return clamp0(diffHours);
  }
  return null;
}

/* ======================= GET ======================= */

export async function GET(req: NextRequest) {
  const adminToken = req.cookies.get("admin_token")?.value;
  if (!adminToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const fromQ = url.searchParams.get("from");
  const toQ = url.searchParams.get("to");

  // Default: last 30 days
  const now = new Date();
  const defaultTo = new Date(now);
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);

  const fromDate = isYMD(fromQ) ? new Date(`${fromQ}T00:00:00.000Z`) : defaultFrom;
  const toDate = isYMD(toQ) ? new Date(`${toQ}T23:59:59.999Z`) : defaultTo;

  const fromYMD = isYMD(fromQ) ? fromQ! : ymd(fromDate);
  const toYMD = isYMD(toQ) ? toQ! : ymd(toDate);

  try {
    await dbConnect();

    // Employees
    const employees = await Employee.find({})
      .select(["_id", "name", "department", "role", "position", "isPaused"].join(" "))
      .lean();

    const employeeIds = employees.map((e: any) => e._id);

    // Salary profiles (1:1)
    const salaryProfiles = await SalaryProfile.find({
      employeeId: { $in: employeeIds },
    }).lean();

    const salaryByEmpId = new Map<string, any>();
    for (const sp of salaryProfiles as any[]) salaryByEmpId.set(String(sp.employeeId), sp);

    // Attendance in range (schema tolerant)
    const attendance = await Attendance.find({
      employeeId: { $in: employeeIds },
      $or: [
        { timestamp: { $gte: fromDate, $lte: toDate } },
        { date: { $gte: fromYMD, $lte: toYMD } },
        { createdAt: { $gte: fromDate, $lte: toDate } },
      ],
    })
      .sort({ createdAt: 1 })
      .lean();

    // Map employeeId -> dayKey -> agg
    const dayAggByEmp = new Map<string, Map<string, DayAgg>>();

    const getDayAgg = (empId: string, day: string): DayAgg => {
      let m = dayAggByEmp.get(empId);
      if (!m) {
        m = new Map();
        dayAggByEmp.set(empId, m);
      }
      let agg = m.get(day);
      if (!agg) {
        agg = {
          hasIn: false,
          hasOut: false,
          inTs: null,
          outTs: null,
          hoursFromField: null,
          overtimeHoursField: null,
          advanceField: null,
        };
        m.set(day, agg);
      }
      return agg;
    };

    for (const a of attendance as any[]) {
      const empId = String(pick(a, ["employeeId", "employee_id", "employee"]) ?? "");
      if (!empId) continue;

      const day = getDayKeyFromAttendance(a);
      if (!day) continue;

      const agg = getDayAgg(empId, day);

      const { isIn, isOut, hasCheckInField, hasCheckOutField } = detectInOut(a);
      const { inDt, outDt } = extractCheckInOutTimestamps(a);

      if (isIn || hasCheckInField) agg.hasIn = true;
      if (isOut || hasCheckOutField) agg.hasOut = true;

      if (inDt) {
        const t = inDt.getTime();
        agg.inTs = agg.inTs === null ? t : Math.min(agg.inTs, t);
      }
      if (outDt) {
        const t = outDt.getTime();
        agg.outTs = agg.outTs === null ? t : Math.max(agg.outTs, t);
      }

      const hoursVal = toNumber(pick(a, ["hours", "workHours", "totalHours", "durationHours"]));
      if (hoursVal !== null) {
        agg.hoursFromField =
          agg.hoursFromField === null ? hoursVal : Math.max(agg.hoursFromField, hoursVal);
      }

      const otVal = toNumber(pick(a, ["overtimeHours", "otHours", "overtime"]));
      if (otVal !== null) {
        agg.overtimeHoursField =
          agg.overtimeHoursField === null ? otVal : Math.max(agg.overtimeHoursField, otVal);
      }

      const advVal = toNumber(pick(a, ["advance", "advances", "advanceAmount"]));
      if (advVal !== null) {
        agg.advanceField = (agg.advanceField ?? 0) + advVal;
      }
    }

    // Metrics used by Workhours + Salary
    type EmpMetrics = {
      name: string;
      department: string;
      role: string;
      position: string;
      paused: boolean;
      validDays: number;
      invalidDays: number;
      totalHours: number;
      overtimeHours: number;
      advances: number;
    };

    const metricsByEmpId = new Map<string, EmpMetrics>();

    for (const e of employees as any[]) {
      const empId = String(e._id);
      const daysMap = dayAggByEmp.get(empId) ?? new Map<string, DayAgg>();

      let validDays = 0;
      let invalidDays = 0;
      let totalHours = 0;
      let overtimeHours = 0;
      let advances = 0;

      for (const [, agg] of daysMap) {
        const valid = agg.hasIn && agg.hasOut;
        if (valid) validDays += 1;
        else invalidDays += 1;

        const dayHours = computeDayHours(agg);
        if (dayHours !== null) totalHours += dayHours;

        if (typeof agg.overtimeHoursField === "number") overtimeHours += agg.overtimeHoursField;
        if (typeof agg.advanceField === "number") advances += agg.advanceField;
      }

      metricsByEmpId.set(empId, {
        name: safeText(e.name),
        department: safeText(e.department),
        role: safeText(e.role),
        position: safeText(e.position),
        paused: !!e.isPaused,
        validDays,
        invalidDays,
        totalHours: Math.round(totalHours * 100) / 100,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        advances: Math.round(advances * 100) / 100,
      });
    }

    /* ======================= Workbook ======================= */
    const wb = new ExcelJS.Workbook();
    wb.creator = "Admin Export";
    wb.created = new Date();

    // Navbar order (EXACT)
    const NAV_SHEETS = [
      "Attendance",
      "Employees",
      "Departments",
      "Roles",
      "Tasks",
      "LunchTime",
      "Messages",
      "Worklogs",
      "Workhours",
      "Salary",
      "Notifications",
      "Rules",
      "Settings",
    ] as const;

    // 1) Attendance (filled)
    const wsAttendance = wb.addWorksheet("Attendance");
    wsAttendance.columns = [
      { header: "Employee", key: "name" },
      { header: "Department", key: "department" },
      { header: "Role", key: "role" },
      { header: "Position", key: "position" },
      { header: "Date (Y-M-D)", key: "day" },
      { header: "Check In (ISO)", key: "checkIn" },
      { header: "Check Out (ISO)", key: "checkOut" },
      { header: "Valid Day", key: "valid" },
      { header: "Work Hours", key: "hours" },
      { header: "Overtime Hours", key: "otHours" },
      { header: "Advance", key: "advance" },
      { header: "From", key: "from" },
      { header: "To", key: "to" },
    ];

    for (const e of employees as any[]) {
      const empId = String(e._id);
      const m = metricsByEmpId.get(empId)!;
      const daysMap = dayAggByEmp.get(empId);

      if (!daysMap || daysMap.size === 0) continue;

      const days = Array.from(daysMap.keys()).sort(); // YMD sorts naturally
      for (const day of days) {
        const agg = daysMap.get(day)!;
        const valid = agg.hasIn && agg.hasOut;
        const hours = computeDayHours(agg);
        wsAttendance.addRow({
          name: m.name,
          department: m.department,
          role: m.role,
          position: m.position,
          day,
          checkIn: fmtDateTime(agg.inTs),
          checkOut: fmtDateTime(agg.outTs),
          valid: valid ? "Yes" : "No",
          hours: hours ?? 0,
          otHours: agg.overtimeHoursField ?? 0,
          advance: agg.advanceField ?? 0,
          from: fromYMD,
          to: toYMD,
        });
      }
    }
    styleHeader(wsAttendance);
    autoWidth(wsAttendance, 10, 30);

    // 2) Employees (filled)
    const wsEmployees = wb.addWorksheet("Employees");
    wsEmployees.columns = [
      { header: "Employee", key: "name" },
      { header: "Department", key: "department" },
      { header: "Role", key: "role" },
      { header: "Position", key: "position" },
      { header: "Paused", key: "paused" },
    ];
    for (const e of employees as any[]) {
      wsEmployees.addRow({
        name: safeText(e.name),
        department: safeText(e.department),
        role: safeText(e.role),
        position: safeText(e.position),
        paused: e.isPaused ? "Yes" : "No",
      });
    }
    styleHeader(wsEmployees);
    autoWidth(wsEmployees, 10, 30);

    // 3) Departments (filled from employees)
    const wsDepartments = wb.addWorksheet("Departments");
    wsDepartments.columns = [
      { header: "Department", key: "department" },
      { header: "Employee Count", key: "count" },
      { header: "Paused Count", key: "pausedCount" },
    ];
    {
      const depAgg = new Map<string, { count: number; pausedCount: number }>();
      for (const e of employees as any[]) {
        const dep = safeText(e.department) || "Unassigned";
        const cur = depAgg.get(dep) ?? { count: 0, pausedCount: 0 };
        cur.count += 1;
        if (e.isPaused) cur.pausedCount += 1;
        depAgg.set(dep, cur);
      }
      for (const [department, v] of Array.from(depAgg.entries()).sort((a, b) =>
        a[0].localeCompare(b[0])
      )) {
        wsDepartments.addRow({ department, count: v.count, pausedCount: v.pausedCount });
      }
    }
    styleHeader(wsDepartments);
    autoWidth(wsDepartments, 10, 30);

    // 4) Roles (filled from employees)
    const wsRoles = wb.addWorksheet("Roles");
    wsRoles.columns = [
      { header: "Role", key: "role" },
      { header: "Employee Count", key: "count" },
      { header: "Paused Count", key: "pausedCount" },
    ];
    {
      const roleAgg = new Map<string, { count: number; pausedCount: number }>();
      for (const e of employees as any[]) {
        const role = safeText(e.role) || "Unassigned";
        const cur = roleAgg.get(role) ?? { count: 0, pausedCount: 0 };
        cur.count += 1;
        if (e.isPaused) cur.pausedCount += 1;
        roleAgg.set(role, cur);
      }
      for (const [role, v] of Array.from(roleAgg.entries()).sort((a, b) =>
        a[0].localeCompare(b[0])
      )) {
        wsRoles.addRow({ role, count: v.count, pausedCount: v.pausedCount });
      }
    }
    styleHeader(wsRoles);
    autoWidth(wsRoles, 10, 30);

    // 5) Tasks (headers only for now)
    addSheetWithColumns(
      wb,
      "Tasks",
      [
        { header: "Task Title", key: "title" },
        { header: "Assigned To", key: "assignedTo" },
        { header: "Status", key: "status" },
        { header: "Due Date", key: "dueDate" },
        { header: "Created At", key: "createdAt" },
      ],
      "TODO: wire Task model + query to fill this sheet."
    );

    // 6) LunchTime (headers only for now)
    addSheetWithColumns(
      wb,
      "LunchTime",
      [
        { header: "Employee", key: "name" },
        { header: "Date (Y-M-D)", key: "day" },
        { header: "Lunch In (ISO)", key: "lunchIn" },
        { header: "Lunch Out (ISO)", key: "lunchOut" },
        { header: "Duration (min)", key: "durationMin" },
      ],
      "TODO: wire Lunch model/logs + query to fill this sheet."
    );

    // 7) Messages (headers only for now)
    addSheetWithColumns(
      wb,
      "Messages",
      [
        { header: "Employee", key: "name" },
        { header: "Subject", key: "subject" },
        { header: "Message", key: "message" },
        { header: "Timestamp (ISO)", key: "timestamp" },
      ],
      "TODO: wire Message model + query to fill this sheet."
    );

    // 8) Worklogs (headers only for now)
    addSheetWithColumns(
      wb,
      "Worklogs",
      [
        { header: "Employee", key: "name" },
        { header: "Date (Y-M-D)", key: "day" },
        { header: "Task / Title", key: "taskTitle" },
        { header: "Log / Note", key: "note" },
        { header: "Hours", key: "hours" },
        { header: "Timestamp (ISO)", key: "timestamp" },
      ],
      "TODO: wire WorkbookDay/Worklog model + query to fill this sheet."
    );

    // 9) Workhours (FILLED) - renamed to match navbar
    const wsWorkhours = wb.addWorksheet("Workhours");
    wsWorkhours.columns = [
      { header: "Employee", key: "name" },
      { header: "Department", key: "department" },
      { header: "Role", key: "role" },
      { header: "Position", key: "position" },
      { header: "Paused", key: "paused" },
      { header: "Valid Attendance (days)", key: "validDays" },
      { header: "Invalid Attendance (days)", key: "invalidDays" },
      { header: "Total Work Hours", key: "totalHours" },
      { header: "Overtime Hours", key: "overtimeHours" },
      { header: "Avg Hours / Valid Day", key: "avgHours" },
      { header: "From", key: "from" },
      { header: "To", key: "to" },
    ];

    for (const e of employees as any[]) {
      const empId = String(e._id);
      const m = metricsByEmpId.get(empId)!;
      const avg = m.validDays > 0 ? Math.round((m.totalHours / m.validDays) * 100) / 100 : 0;

      wsWorkhours.addRow({
        name: m.name,
        department: m.department,
        role: m.role,
        position: m.position,
        paused: m.paused ? "Yes" : "No",
        validDays: m.validDays,
        invalidDays: m.invalidDays,
        totalHours: m.totalHours,
        overtimeHours: m.overtimeHours,
        avgHours: avg,
        from: fromYMD,
        to: toYMD,
      });
    }
    styleHeader(wsWorkhours);
    autoWidth(wsWorkhours, 10, 30);

    // 10) Salary (FILLED) - same as your logic
    const wsSalary = wb.addWorksheet("Salary");
    wsSalary.columns = [
      { header: "Employee", key: "name" },
      { header: "Department", key: "department" },
      { header: "Role", key: "role" },
      { header: "Position", key: "position" },

      { header: "Pay Type", key: "payType" }, // monthly/hourly
      { header: "Base Monthly", key: "baseMonthly" },
      { header: "Hourly Rate", key: "hourlyRate" },
      { header: "Overtime Rate", key: "overtimeRate" },

      { header: "Allowances", key: "allowances" },
      { header: "Deductions", key: "deductions" },
      { header: "Advances", key: "advances" },

      { header: "Work Hours (range)", key: "workHours" },
      { header: "Overtime Hours (range)", key: "otHours" },

      { header: "Gross Pay (range)", key: "grossPay" },
      { header: "Net Pay (range)", key: "netPay" },

      { header: "Notes", key: "notes" },
      { header: "From", key: "from" },
      { header: "To", key: "to" },
    ];

    for (const e of employees as any[]) {
      const empId = String(e._id);
      const m = metricsByEmpId.get(empId)!;

      const sp = salaryByEmpId.get(empId);

      const payType = String(sp?.payType ?? "monthly");
      const baseMonthly = toNumber(sp?.baseMonthly) ?? 0;
      const hourlyRate = toNumber(sp?.hourlyRate) ?? 0;
      const overtimeRate = toNumber(sp?.overtimeRate) ?? 0;
      const allowances = toNumber(sp?.allowances) ?? 0;
      const deductions = toNumber(sp?.deductions) ?? 0;

      const advances = m.advances ?? 0;

      let grossPay = 0;
      if (payType === "hourly") {
        grossPay = m.totalHours * hourlyRate + m.overtimeHours * overtimeRate + allowances;
      } else {
        grossPay = baseMonthly + allowances;
      }
      grossPay = Math.round(grossPay * 100) / 100;

      const netPay = Math.round((grossPay - deductions - advances) * 100) / 100;

      wsSalary.addRow({
        name: m.name,
        department: m.department,
        role: m.role,
        position: m.position,

        payType,
        baseMonthly,
        hourlyRate,
        overtimeRate,

        allowances,
        deductions,
        advances,

        workHours: m.totalHours,
        otHours: m.overtimeHours,

        grossPay,
        netPay,

        notes: safeText(sp?.notes ?? ""),
        from: fromYMD,
        to: toYMD,
      });
    }
    styleHeader(wsSalary);
    autoWidth(wsSalary, 10, 30);

    // 11) Notifications (headers only for now)
    addSheetWithColumns(
      wb,
      "Notifications",
      [
        { header: "Employee", key: "name" },
        { header: "Title", key: "title" },
        { header: "Message", key: "message" },
        { header: "Schedule", key: "schedule" },
        { header: "Sent At (ISO)", key: "sentAt" },
        { header: "Status", key: "status" },
      ],
      "TODO: wire Notification model + query to fill this sheet."
    );

    // 12) Rules (headers only for now)
    addSheetWithColumns(
      wb,
      "Rules",
      [
        { header: "Rule Name", key: "name" },
        { header: "Key", key: "key" },
        { header: "Value", key: "value" },
        { header: "Enabled", key: "enabled" },
        { header: "Updated At", key: "updatedAt" },
      ],
      "TODO: wire Rules model + query to fill this sheet."
    );

    // 13) Settings (headers only for now)
    addSheetWithColumns(
      wb,
      "Settings",
      [
        { header: "Key", key: "key" },
        { header: "Value", key: "value" },
        { header: "Updated At", key: "updatedAt" },
      ],
      "TODO: wire Settings source + query to fill this sheet."
    );

    // Ensure sheet order matches navbar exactly (ExcelJS keeps add order; this is just a sanity check)
    // NAV_SHEETS order is respected because we added in that order.

    const buf = await wb.xlsx.writeBuffer();
    const filename = `payroll_${fromYMD}_to_${toYMD}.xlsx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("Export failed:", err);
    return NextResponse.json(
      { error: "Export failed", details: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
