import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import {
  computeAttendanceSummary,
  parseYMD,
  msToHMS,
} from "@/lib/adminAttendanceSummary";

export const runtime = "nodejs";

function safeSheetName(name: string) {
  // Excel sheet name rules: max 31 chars, no: : \ / ? * [ ]
  const cleaned = name.replace(/[:\\/?*\[\]]/g, " ").trim();
  return cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned || "Employee";
}

function fmtLocal(iso: string | null, tz: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const from = parseYMD(searchParams.get("from"));
    const to = parseYMD(searchParams.get("to"));
    const tz = searchParams.get("tz") || "Asia/Kathmandu";
    const employeeId = searchParams.get("employeeId") || "";
    const closeOpenAt = (searchParams.get("closeOpenAt") || "now") as "now" | "endOfDay";

    if (!from || !to) {
      return NextResponse.json(
        { success: false, error: "from/to (YYYY-MM-DD) are required" },
        { status: 400 }
      );
    }

    const data = await computeAttendanceSummary({ from, to, tz, employeeId, closeOpenAt });

    const wb = new ExcelJS.Workbook();
    wb.creator = "MyPharmaCity";
    wb.created = new Date();

    // -------------------- Summary sheet --------------------
    const ws = wb.addWorksheet("Summary", { views: [{ state: "frozen", ySplit: 1 }] });

    ws.columns = [
      { header: "Employee", key: "employee", width: 28 },
      { header: "Employee ID", key: "employeeId", width: 24 },
      { header: "Valid Days", key: "validDays", width: 12 },
      { header: "Invalid Days", key: "invalidDays", width: 12 },
      { header: "Gross (HH:MM:SS)", key: "gross", width: 16 },
      { header: "Lunch (HH:MM:SS)", key: "lunch", width: 16 },
      { header: "Net (HH:MM:SS)", key: "net", width: 16 },
      { header: "Avg Net/Valid Day", key: "avg", width: 18 },
    ];

    for (const emp of data.employees) {
      ws.addRow({
        employee: emp.employeeName,
        employeeId: emp.employeeId,
        validDays: emp.totals.validDays,
        invalidDays: emp.totals.invalidDays,
        gross: emp.totals.grossHMS,
        lunch: emp.totals.lunchHMS,
        net: emp.totals.netHMS,
        avg: emp.totals.avgNetPerValidDayHMS,
      });
    }

    ws.addRow({});
    ws.addRow({
      employee: "TOTAL",
      employeeId: "",
      validDays: data.totalsAll.validDays,
      invalidDays: data.totalsAll.invalidDays,
      gross: data.totalsAll.grossHMS,
      lunch: data.totalsAll.lunchHMS,
      net: data.totalsAll.netHMS,
      avg: data.totalsAll.avgNetPerValidDayHMS,
    });

    ws.getRow(1).font = { bold: true };

    // -------------------- Per-employee sheets --------------------
    const usedNames = new Set<string>(["Summary"]);

    for (const emp of data.employees) {
      let sheetName = safeSheetName(emp.employeeName || emp.employeeId);
      if (usedNames.has(sheetName)) {
        // ensure unique
        let n = 2;
        while (usedNames.has(`${sheetName.slice(0, 28)}-${n}`)) n++;
        sheetName = `${sheetName.slice(0, 28)}-${n}`;
      }
      usedNames.add(sheetName);

      const s = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 6 }] });

      // Header block (like your screenshot style)
      s.getCell("A1").value = `Employee: ${emp.employeeName}`;
      s.getCell("A2").value = `Employee ID: ${emp.employeeId}`;
      s.getCell("A3").value = `Range: ${data.range.from} to ${data.range.to} (${data.range.tz})`;

      s.getCell("A1").font = { bold: true, size: 14 };

      s.getCell("A5").value = "Daily WorkHours (Detailed)";
      s.getCell("A5").font = { bold: true };

      // Table header row at 6
      const headerRow = s.getRow(6);
      headerRow.values = [
        "Date",
        "Status",
        "Reasons",
        "First In (Local)",
        "Last Out (Local)",
        "Gross (HH:MM:SS)",
        "Lunch (HH:MM:SS)",
        "Net (HH:MM:SS)",
        "Checkins",
        "Checkouts",
        "Orphan Checkouts",
        "Has Open Checkin",
        "Paired (debug)",
        "Preview Gross (debug)",
      ];
      headerRow.font = { bold: true };

      // Column widths
      s.columns = [
        { key: "date", width: 12 },
        { key: "status", width: 10 },
        { key: "reasons", width: 28 },
        { key: "firstIn", width: 22 },
        { key: "lastOut", width: 22 },
        { key: "gross", width: 16 },
        { key: "lunch", width: 16 },
        { key: "net", width: 16 },
        { key: "ci", width: 10 },
        { key: "co", width: 10 },
        { key: "orphan", width: 16 },
        { key: "open", width: 16 },
        { key: "paired", width: 16 },
        { key: "preview", width: 18 },
      ];

      // Data rows start at 7
      for (const d of emp.byDay) {
        s.addRow([
          d.date,
          d.status,
          (d.reasons || []).join(", "),
          fmtLocal(d.firstIn, tz),
          fmtLocal(d.lastOut, tz),
          msToHMS(d.grossMs),
          msToHMS(d.lunchMs),
          msToHMS(d.netMs),
          d.checkinCount,
          d.checkoutCount,
          d.orphanCheckoutCount,
          d.hasOpenCheckin ? "YES" : "NO",
          msToHMS(d.pairedMs),
          msToHMS(d.previewGrossMs),
        ]);
      }

      // Totals block below
      s.addRow([]);
      s.addRow(["TOTALS", "", "", "", "", emp.totals.grossHMS, emp.totals.lunchHMS, emp.totals.netHMS]);
      s.addRow(["Valid Days", emp.totals.validDays]);
      s.addRow(["Invalid Days", emp.totals.invalidDays]);
    }

    const buffer = await wb.xlsx.writeBuffer();

    const filename = `workhours_${from}_to_${to}.xlsx`;

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to export excel" },
      { status: 500 }
    );
  }
}
