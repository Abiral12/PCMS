// lib/adminAttendanceSummary.ts
import dbConnect from "@/lib/mongodb";
import Attendance from "@/models/Attendance";
import LunchLog from "@/models/LunchLog";
import Employee from "@/models/Employee";

export type AttendanceType = "checkin" | "checkout";
export type LunchType = "lunch-start" | "lunch-end";

export type DayStatus = "valid" | "invalid";
export type InvalidReason =
  | "missing_checkin"
  | "missing_checkout"
  | "open_checkin"
  | "orphan_checkout"
  | "checkout_before_checkin"
  | "no_valid_pairs";

export type DayRow = {
  date: string; // YYYY-MM-DD (tz day key)
  firstIn: string | null;
  lastOut: string | null;

  status: DayStatus;
  includedInTotals: boolean;
  reasons: InvalidReason[];

  grossMs: number;
  lunchMs: number;
  netMs: number;

  pairedMs: number;
  previewGrossMs: number;
  checkinCount: number;
  checkoutCount: number;
  pairsCount: number;
  orphanCheckoutCount: number;
  hasOpenCheckin: boolean;
};

export type EmpOut = {
  employeeId: string;
  employeeName: string;
  totals: {
    validDays: number;
    invalidDays: number;

    grossMs: number;
    lunchMs: number;
    netMs: number;

    grossHMS: string;
    lunchHMS: string;
    netHMS: string;

    avgNetPerValidDayHMS: string;
  };
  validDays: DayRow[];
  invalidDays: DayRow[];
  byDay: DayRow[];
};

export function msToHMS(ms: number) {
  const safe = Math.max(0, ms || 0);
  const totalSec = Math.floor(safe / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// yyyy-mm-dd in a timeZone using Intl
export function dateKeyInTZ(iso: string, timeZone: string) {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

export function rangeToISO(from: string, to: string) {
  const fromISO = new Date(`${from}T00:00:00.000Z`).toISOString();
  const toISO = new Date(`${to}T23:59:59.999Z`).toISOString();
  return { fromISO, toISO };
}

export function parseYMD(q: string | null) {
  if (!q) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q)) return null;
  return q;
}

export async function computeAttendanceSummary(opts: {
  from: string;
  to: string;
  tz: string;
  employeeId?: string;
  closeOpenAt?: "now" | "endOfDay";
}) {
  await dbConnect();

  const { from, to, tz, employeeId = "", closeOpenAt = "now" } = opts;
  const { fromISO, toISO } = rangeToISO(from, to);

  const baseMatch: any = {
    timestamp: { $gte: new Date(fromISO), $lte: new Date(toISO) },
  };
  if (employeeId) baseMatch.employeeId = employeeId;

  const [attendanceRows, lunchRows] = await Promise.all([
    Attendance.find(baseMatch)
      .select("employeeId employeeName type timestamp")
      .sort({ employeeId: 1, timestamp: 1 })
      .lean(),
    LunchLog.find({
      ...baseMatch,
      type: { $in: ["lunch-start", "lunch-end"] },
    })
      .select("employeeId type timestamp")
      .sort({ employeeId: 1, timestamp: 1 })
      .lean(),
  ]);


    // Build employeeId list from attendance rows (best source for which employees exist in this range)
  const empIds = Array.from(
    new Set(attendanceRows.map((r: any) => String(r.employeeId)))
  );

  // Load employee master data (same pattern as worklogs/export)
  const empDocs = empIds.length
    ? await Employee.find({ _id: { $in: empIds } })
        .select({ _id: 1, name: 1, position: 1 })
        .lean()
    : [];

  const empById = new Map<string, { name: string; position?: string }>();
  for (const e of empDocs as any[]) {
    const id = String(e._id);
    empById.set(id, { name: e.name || "", position: e.position || "" });
  }

  // lunch totals per employee per day
  const lunchByEmpDay = new Map<string, number>(); // emp__YYYY-MM-DD -> ms

  for (let i = 0; i < lunchRows.length; ) {
    const emp = String(lunchRows[i].employeeId);
    let j = i;

    const empLogs: Array<{ type: LunchType; timestamp: string }> = [];
    while (j < lunchRows.length && String(lunchRows[j].employeeId) === emp) {
      empLogs.push({
        type: lunchRows[j].type,
        timestamp: new Date(lunchRows[j].timestamp).toISOString(),
      });
      j++;
    }

    const openByDay = new Map<string, string>();
    for (const ev of empLogs) {
      const dayKey = dateKeyInTZ(ev.timestamp, tz);
      if (ev.type === "lunch-start") {
        if (!openByDay.has(dayKey)) openByDay.set(dayKey, ev.timestamp);
      } else {
        const startISO = openByDay.get(dayKey);
        if (startISO) {
          const dur = Math.max(0, new Date(ev.timestamp).getTime() - new Date(startISO).getTime());
          const key = `${emp}__${dayKey}`;
          lunchByEmpDay.set(key, (lunchByEmpDay.get(key) || 0) + dur);
          openByDay.delete(dayKey);
        }
      }
    }
    i = j;
  }

  const employees: EmpOut[] = [];
  let totalsAllGross = 0;
  let totalsAllLunch = 0;
  let totalsAllNet = 0;
  let totalsAllValidDays = 0;
  let totalsAllInvalidDays = 0;

  for (let i = 0; i < attendanceRows.length; ) {
    const emp = String(attendanceRows[i].employeeId);
    const master = empById.get(emp);
let empName = master?.name || attendanceRows[i].employeeName || "";

    let j = i;

    const events: Array<{ type: AttendanceType; ts: string }> = [];
    while (j < attendanceRows.length && String(attendanceRows[j].employeeId) === emp) {
      empName = empName || attendanceRows[j].employeeName || "";
      events.push({
        type: attendanceRows[j].type,
        ts: new Date(attendanceRows[j].timestamp).toISOString(),
      });
      j++;
    }

    const dayMap = new Map<
      string,
      {
        firstIn: string | null;
        lastOut: string | null;
        pairedMs: number;
        openIn: string | null;
        checkinCount: number;
        checkoutCount: number;
        pairsCount: number;
        orphanCheckoutCount: number;
      }
    >();

    for (const ev of events) {
      const dayKey = dateKeyInTZ(ev.ts, tz);
      const day =
        dayMap.get(dayKey) || {
          firstIn: null,
          lastOut: null,
          pairedMs: 0,
          openIn: null,
          checkinCount: 0,
          checkoutCount: 0,
          pairsCount: 0,
          orphanCheckoutCount: 0,
        };

      if (ev.type === "checkin") {
        day.checkinCount += 1;
        day.firstIn = day.firstIn ? (new Date(ev.ts) < new Date(day.firstIn) ? ev.ts : day.firstIn) : ev.ts;
        if (!day.openIn) day.openIn = ev.ts;
      } else {
        day.checkoutCount += 1;
        day.lastOut = day.lastOut ? (new Date(ev.ts) > new Date(day.lastOut) ? ev.ts : day.lastOut) : ev.ts;

        if (day.openIn) {
          const dur = Math.max(0, new Date(ev.ts).getTime() - new Date(day.openIn).getTime());
          day.pairedMs += dur;
          day.pairsCount += 1;
          day.openIn = null;
        } else {
          day.orphanCheckoutCount += 1;
        }
      }

      dayMap.set(dayKey, day);
    }

    const now = new Date();

    const byDay: DayRow[] = Array.from(dayMap.entries())
      .map(([date, d]) => {
        const lunchMs = lunchByEmpDay.get(`${emp}__${date}`) || 0;

        let previewGrossMs = d.pairedMs;
        const hasOpenCheckin = Boolean(d.openIn);
        if (hasOpenCheckin) {
          const end = now; // preview only
          previewGrossMs += Math.max(0, end.getTime() - new Date(d.openIn!).getTime());
        }

        const reasons: InvalidReason[] = [];
        const hasFirstIn = Boolean(d.firstIn);
        const hasLastOut = Boolean(d.lastOut);

        if (!hasFirstIn) reasons.push("missing_checkin");
        if (!hasLastOut) reasons.push("missing_checkout");

        if (hasFirstIn && hasLastOut) {
          const inMs = new Date(d.firstIn!).getTime();
          const outMs = new Date(d.lastOut!).getTime();
          if (outMs <= inMs) reasons.push("checkout_before_checkin");
        }

        const isValid = reasons.length === 0;

        let grossMs = 0;
        if (isValid) grossMs = Math.max(0, new Date(d.lastOut!).getTime() - new Date(d.firstIn!).getTime());

        const includedInTotals = isValid;
        const lunchCountedMs = includedInTotals ? lunchMs : 0;
        const netMs = includedInTotals ? Math.max(0, grossMs - lunchCountedMs) : 0;

        return {
          date,
          firstIn: d.firstIn,
          lastOut: d.lastOut,
          status: isValid ? ("valid" as DayStatus) : ("invalid" as DayStatus),
          includedInTotals,
          reasons,
          grossMs,
          lunchMs: lunchCountedMs,
          netMs,
          pairedMs: d.pairedMs,
          previewGrossMs,
          checkinCount: d.checkinCount,
          checkoutCount: d.checkoutCount,
          pairsCount: d.pairsCount,
          orphanCheckoutCount: d.orphanCheckoutCount,
          hasOpenCheckin,
        };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const validDays = byDay.filter((d) => d.status === "valid");
    const invalidDays = byDay.filter((d) => d.status === "invalid");

    const validDaysCount = validDays.length;
    const invalidDaysCount = invalidDays.length;

    const grossMs = validDays.reduce((s, d) => s + d.grossMs, 0);
    const lunchMs = validDays.reduce((s, d) => s + d.lunchMs, 0);
    const netMs = validDays.reduce((s, d) => s + d.netMs, 0);

    totalsAllGross += grossMs;
    totalsAllLunch += lunchMs;
    totalsAllNet += netMs;
    totalsAllValidDays += validDaysCount;
    totalsAllInvalidDays += invalidDaysCount;

    employees.push({
      employeeId: emp,
      employeeName: empName || "Employee",

      totals: {
        validDays: validDaysCount,
        invalidDays: invalidDaysCount,
        grossMs,
        lunchMs,
        netMs,
        grossHMS: msToHMS(grossMs),
        lunchHMS: msToHMS(lunchMs),
        netHMS: msToHMS(netMs),
        avgNetPerValidDayHMS: msToHMS(validDaysCount ? Math.floor(netMs / validDaysCount) : 0),
      },
      validDays,
      invalidDays,
      byDay,
    });

    i = j;
  }

  return {
    range: { from, to, tz, closeOpenAt },
    employees,
    totalsAll: {
      validDays: totalsAllValidDays,
      invalidDays: totalsAllInvalidDays,
      grossMs: totalsAllGross,
      lunchMs: totalsAllLunch,
      netMs: totalsAllNet,
      grossHMS: msToHMS(totalsAllGross),
      lunchHMS: msToHMS(totalsAllLunch),
      netHMS: msToHMS(totalsAllNet),
      avgNetPerValidDayHMS: msToHMS(totalsAllValidDays ? Math.floor(totalsAllNet / totalsAllValidDays) : 0),
    },
  };
}
