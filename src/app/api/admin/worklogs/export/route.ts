// app/api/admin/worklogs/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import dbConnect from "@/lib/mongodb";
import Employee from "@/models/Employee";
import WorkbookDay from "@/models/WorkbookDay";

export const runtime = "nodejs";

/* ======================= Helpers ======================= */

function isYMD(s: string | null) {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Excel sheet name rules: max 31 chars, cannot contain: : \ / ? * [ ]
function safeSheetName(name: string) {
  const cleaned = (name || "Employee")
    .replace(/[:\\/?*\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const base = cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned;
  return base || "Employee";
}

// Ensure sheet names are unique in workbook
function uniqueSheetName(wb: ExcelJS.Workbook, desired: string) {
  const base = safeSheetName(desired);
  let name = base;
  let i = 2;

  // Excel also forbids duplicate names (case-insensitive)
  const exists = (n: string) =>
    wb.worksheets.some((ws) => ws.name.toLowerCase() === n.toLowerCase());

  while (exists(name)) {
    const suffix = ` (${i})`;
    const cut = Math.max(1, 31 - suffix.length);
    name = `${base.slice(0, cut)}${suffix}`;
    i++;
  }
  return name;
}

function fmtTime(d: any) {
  const dt = typeof d === "string" ? new Date(d) : d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function headerStyle(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.alignment = { vertical: "middle" as const };
  row.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF3F4F6" }, // light gray
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } },
    };
  });
}

function autosizeColumns(ws: ExcelJS.Worksheet, maxWidth = 70) {
  const widths: number[] = [];
  ws.eachRow((row) => {
    row.eachCell((cell, colNumber) => {
      const v = cell.value;
      const text =
        v == null
          ? ""
          : typeof v === "string"
            ? v
            : typeof v === "number"
              ? String(v)
              : typeof v === "boolean"
                ? String(v)
                : typeof v === "object" && "richText" in (v as any)
                  ? (v as any).richText?.map((x: any) => x.text).join("") ?? ""
                  : String(v);

      const len = Math.min(maxWidth, Math.max(8, text.length + 2));
      widths[colNumber - 1] = Math.max(widths[colNumber - 1] || 10, len);
    });
  });

  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = Math.min(maxWidth, Math.max(10, w));
  });
}

/* ======================= Route ======================= */

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  // Optional filters:
  const date = url.searchParams.get("date"); // YYYY-MM-DD (single day)
  const from = url.searchParams.get("from"); // YYYY-MM-DD
  const to = url.searchParams.get("to"); // YYYY-MM-DD
  const employeeId = url.searchParams.get("employeeId"); // optional

  // Validate date params (string-based YYYY-MM-DD)
  if (date && !isYMD(date)) {
    return NextResponse.json({ error: "Invalid `date`. Use YYYY-MM-DD." }, { status: 400 });
  }
  if (from && !isYMD(from)) {
    return NextResponse.json({ error: "Invalid `from`. Use YYYY-MM-DD." }, { status: 400 });
  }
  if (to && !isYMD(to)) {
    return NextResponse.json({ error: "Invalid `to`. Use YYYY-MM-DD." }, { status: 400 });
  }
  if (from && to && from > to) {
    return NextResponse.json({ error: "`from` cannot be after `to`." }, { status: 400 });
  }
  if (date && (from || to)) {
    return NextResponse.json({ error: "Use either `date` OR `from/to`, not both." }, { status: 400 });
  }

  await dbConnect();

  // Build WorkbookDay query (assumes WorkbookDay.date is stored as "YYYY-MM-DD" string)
  const wq: any = {};
  if (employeeId) wq.employeeId = employeeId;

  if (date) {
    wq.date = date;
  } else if (from || to) {
    if (from && to) wq.date = { $gte: from, $lte: to };
    else if (from) wq.date = { $gte: from };
    else if (to) wq.date = { $lte: to };
  }
  // If no date/from/to: export all (be careful for huge DB). Keeping as-is.

  const days = await WorkbookDay.find(wq)
    .select({
      employeeId: 1,
      date: 1,
      todos: 1,
      hourly: 1, // object: { [hour]: text } (legacy / alternate)
      hourlyLogs: 1, // array: [{ timestamp, text }]
      notes: 1,
      updatedAt: 1,
    })
    .lean();

  // Group by employeeId
  const byEmp = new Map<string, any[]>();
  for (const d of days) {
    const key = String(d.employeeId);
    if (!byEmp.has(key)) byEmp.set(key, []);
    byEmp.get(key)!.push(d);
  }

  // Load employees ONLY for those found in days (unless employeeId explicitly requested)
  const empIds = employeeId ? [employeeId] : Array.from(byEmp.keys());
  const employees = empIds.length
    ? await Employee.find({ _id: { $in: empIds } })
        .select({ _id: 1, name: 1, position: 1 })
        .lean()
    : [];

  // Build workbook
  const wb = new ExcelJS.Workbook();
  wb.creator = "MyPharmaCity";
  wb.created = new Date();

  /* ======================= Summary Sheet ======================= */
  const summary = wb.addWorksheet("Summary", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  summary.columns = [
    { header: "Employee", key: "employee", width: 28 },
    { header: "Position", key: "position", width: 18 },
    { header: "Days", key: "days", width: 10 },
    { header: "Todos", key: "todos", width: 10 },
    { header: "Done", key: "done", width: 10 },
    { header: "Pending", key: "pending", width: 10 },
    { header: "Logs", key: "logs", width: 10 },
    { header: "Last Updated", key: "updated", width: 22 },
  ];

  headerStyle(summary.getRow(1));

  for (const emp of employees) {
    const empId = String(emp._id);
    const empDays = (byEmp.get(empId) || [])
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    let todos = 0;
    let done = 0;
    let pending = 0;
    let logs = 0;
    let lastISO = "";

    for (const d of empDays) {
      const t = Array.isArray(d.todos) ? d.todos : [];
      const doneCount = t.filter((x: any) => x.status === "done" || x.done === true).length;

      todos += t.length;
      done += doneCount;
      pending += t.length - doneCount;

      const hourlyArr = Array.isArray(d.hourlyLogs) ? d.hourlyLogs : [];
      const hourlyObjCount =
        d.hourly && typeof d.hourly === "object"
          ? Object.values(d.hourly).filter((v) => String(v || "").trim().length > 0).length
          : 0;

      logs += hourlyArr.length + hourlyObjCount;

      const up = d.updatedAt ? new Date(d.updatedAt).toISOString() : "";
      if (up && up > lastISO) lastISO = up;
    }

    summary.addRow({
      employee: emp.name || "Employee",
      position: emp.position || "",
      days: empDays.length,
      todos,
      done,
      pending,
      logs,
      updated: lastISO ? new Date(lastISO).toLocaleString() : "",
    });
  }

  /* ======================= One Sheet Per Employee ======================= */
  for (const emp of employees) {
    const empId = String(emp._id);
    const empDays = (byEmp.get(empId) || [])
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    // If you prefer NOT to include employees with no data in range, skip here:
    // if (empDays.length === 0) continue;

    const ws = wb.addWorksheet(uniqueSheetName(wb, emp.name || "Employee"));

    // Header block
    ws.addRow([`Employee: ${emp.name || "Employee"}`]).font = { bold: true, size: 14 };
    ws.addRow([`Position: ${emp.position || ""}`]).font = { italic: true };
    ws.addRow([`Exported: ${new Date().toLocaleString()}`]).font = { color: { argb: "FF555555" } };

    const rangeLabel =
      date
        ? `Date: ${date}`
        : from || to
          ? `Range: ${from || "start"} → ${to || "end"}`
          : "Range: ALL";
    ws.addRow([rangeLabel]).font = { color: { argb: "FF555555" } };

    ws.addRow([]);

    // Section: Daily Summary
    ws.addRow(["Daily Summary"]).font = { bold: true };
    ws.addRow(["Date", "Total Todos", "Done", "Pending", "Logs", "Notes", "Updated At"]);
    headerStyle(ws.getRow(ws.rowCount));

    const freezeAt = ws.rowCount;
    ws.views = [{ state: "frozen", ySplit: freezeAt }];

    for (const d of empDays) {
      const t = Array.isArray(d.todos) ? d.todos : [];
      const doneCount = t.filter((x: any) => x.status === "done" || x.done === true).length;

      const hourlyArr = Array.isArray(d.hourlyLogs) ? d.hourlyLogs : [];
      const hourlyObjCount =
        d.hourly && typeof d.hourly === "object"
          ? Object.values(d.hourly).filter((v) => String(v || "").trim().length > 0).length
          : 0;

      const logsCount = hourlyArr.length + hourlyObjCount;

      ws.addRow([
        d.date || "",
        t.length,
        doneCount,
        t.length - doneCount,
        logsCount,
        d.notes || "",
        d.updatedAt ? new Date(d.updatedAt).toLocaleString() : "",
      ]);
    }

    ws.addRow([]);
    ws.addRow(["Todos (detailed)"]).font = { bold: true };
    ws.addRow(["Date", "Status", "Title", "Updated At"]);
    headerStyle(ws.getRow(ws.rowCount));

    for (const d of empDays) {
      const t = Array.isArray(d.todos) ? d.todos : [];
      for (const todo of t) {
        ws.addRow([
          d.date || "",
          todo.status || (todo.done ? "done" : "pending"),
          todo.title || todo.text || "",
          todo.updatedAt ? new Date(todo.updatedAt).toLocaleString() : "",
        ]);
      }
    }

    ws.addRow([]);
    ws.addRow(["Hourly Logs (detailed)"]).font = { bold: true };
    ws.addRow(["Date", "Time", "Text"]);
    headerStyle(ws.getRow(ws.rowCount));

    for (const d of empDays) {
      // If array logs exist: [{ timestamp, text }]
      const hourlyArr = Array.isArray(d.hourlyLogs) ? d.hourlyLogs : [];

      // If object logs exist: { [hourNumber]: text }
      const hourlyObj = d.hourly && typeof d.hourly === "object" ? d.hourly : null;

      // Array logs
      for (const l of hourlyArr) {
        ws.addRow([d.date || "", l.timestamp ? fmtTime(l.timestamp) : "", l.text || ""]);
      }

      // Object logs (hour -> text)
      if (hourlyObj) {
        const entries = Object.entries(hourlyObj)
          .map(([k, v]) => ({ hour: Number(k), text: String(v || "") }))
          .filter((x) => x.text.trim().length > 0 && Number.isFinite(x.hour))
          .sort((a, b) => a.hour - b.hour);

        for (const it of entries) {
          ws.addRow([d.date || "", `${String(it.hour).padStart(2, "0")}:00`, it.text]);
        }
      }
    }

    // Basic readability improvements
    ws.getColumn(1).alignment = { vertical: "top" };
    ws.getColumn(6).alignment = { wrapText: true, vertical: "top" };
    ws.getColumn(3).alignment = { wrapText: true, vertical: "top" };

    autosizeColumns(ws);
  }

  // If no employees found but there are days (rare), still export something useful
  if (employees.length === 0) {
    const ws = wb.addWorksheet("No Data");
    ws.addRow(["No worklogs found for the selected filter(s)."]).font = { bold: true };
    ws.addRow([
      date
        ? `date=${date}`
        : `from=${from || ""} to=${to || ""}`,
    ]);
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer as ArrayBuffer);

  const label =
    date
      ? date
      : from || to
        ? `${from || "start"}_to_${to || "end"}`
        : "all";

  const safeLabel = label.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  const fileName = `worklogs_${safeLabel || "export"}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
