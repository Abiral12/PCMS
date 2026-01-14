// app/api/admin/worklogs/route.ts
import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import WorkbookDay from "@/models/WorkbookDay";

export const runtime = "nodejs";

const NEPAL_TZ_OFFSET = "+05:45"; // Nepal fixed offset

function isYYYYMMDD(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * For legacy "hourly" map that stores {hour: "text"} without a timestamp,
 * we synthesize a timestamp in Nepal local time.
 */
function nepalISO(dateYYYYMMDD: string, hour: number) {
  return new Date(
    `${dateYYYYMMDD}T${pad2(hour)}:00:00${NEPAL_TZ_OFFSET}`
  ).toISOString();
}

function pickEmployeeName(doc: any) {
  if (doc?.employeeName) return doc.employeeName;

  const emp = doc?.employeeId;
  if (emp && typeof emp === "object" && emp.name) return emp.name;

  return "Unknown";
}

function normalizeTodos(doc: any) {
  const list = Array.isArray(doc?.todos) ? doc.todos : [];

  return list.map((t: any) => {
    const title = (t?.title ?? t?.text ?? "").toString();
    const status =
      (t?.status ??
        (t?.done === true ? "done" : "pending")) as
        | "pending"
        | "done"
        | "cancelled"
        | "in-progress";

    const empId = String(doc?.employeeId?._id ?? doc?.employeeId ?? "");

    return {
      _id: String(t?._id ?? t?.id ?? `${doc?._id ?? "todo"}-${title}`),
      employeeId: empId,
      employeeName: pickEmployeeName(doc),
      date: doc?.date,
      title,
      status,
      updatedAt: t?.updatedAt
        ? new Date(t.updatedAt).toISOString()
        : doc?.updatedAt
          ? new Date(doc.updatedAt).toISOString()
          : undefined,
      createdAt: t?.createdAt ? new Date(t.createdAt).toISOString() : undefined,
    };
  });
}

function normalizeHourlyLogs(doc: any) {
  const date = (doc?.date || "").toString();
  const empId = String(doc?.employeeId?._id ?? doc?.employeeId ?? "");
  const empName = pickEmployeeName(doc);

  // -------------------------
  // ✅ Case 0: NEW storage (sessions -> slots)
  // -------------------------
  const sessions = Array.isArray(doc?.sessions) ? doc.sessions : [];
  if (sessions.length) {
    const out: any[] = [];

    sessions.forEach((s: any, si: number) => {
      const slots = Array.isArray(s?.slots) ? s.slots : [];
      slots.forEach((sl: any, sli: number) => {
        const text = (sl?.text ?? "").toString();
        if (!text.trim()) return;

        const start = sl?.start ? new Date(sl.start) : null;
        const end = sl?.end ? new Date(sl.end) : null;

        // Use slot.start so admin shows 10:40, 11:40, ...
        const ts = start
          ? start.toISOString()
          : new Date(doc?.updatedAt ?? Date.now()).toISOString();

        out.push({
          _id: String(sl?._id ?? `${doc?._id}-s${si}-sl${sli}`),
          employeeId: empId,
          employeeName: empName,
          date,
          text,
          timestamp: ts,

          // optional fields (helpful if UI wants ranges)
          start: start ? start.toISOString() : undefined,
          end: end ? end.toISOString() : undefined,
          sessionCheckIn: s?.checkIn ? new Date(s.checkIn).toISOString() : undefined,
          sessionCheckOut: s?.checkOut ? new Date(s.checkOut).toISOString() : undefined,
        });
      });
    });

    // Sort by actual time
    out.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return out;
  }

  // -------------------------
  // ✅ Legacy: hourlyLogs array
  // -------------------------
  if (Array.isArray(doc?.hourlyLogs) && doc.hourlyLogs.length) {
    return doc.hourlyLogs
      .map((l: any) => {
        const hour = Number(l?.hour);
        const text = (l?.text ?? "").toString();

        const ts =
          l?.timestamp
            ? new Date(l.timestamp).toISOString()
            : isYYYYMMDD(date) && Number.isFinite(hour)
              ? nepalISO(date, hour)
              : new Date(doc?.updatedAt ?? Date.now()).toISOString();

        return {
          _id: String(l?._id ?? `${doc?._id}-h-${Number.isFinite(hour) ? hour : "x"}`),
          employeeId: empId,
          employeeName: empName,
          date,
          hour: Number.isFinite(hour) ? hour : undefined,
          text,
          timestamp: ts,
        };
      })
      .filter((x: any) => x.text && x.text.trim().length > 0)
      .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  // -------------------------
  // ✅ Legacy: hourly map { "9": "did X", "10": "did Y" }
  // -------------------------
  const hourlyObj = doc?.hourly;
  if (hourlyObj && typeof hourlyObj === "object") {
    const entries = Object.entries(hourlyObj as Record<string, any>);

    return entries
      .map(([k, v]) => {
        const hour = Number(k);
        const text = (v ?? "").toString();
        if (!text.trim()) return null;

        return {
          _id: `${doc?._id}-h-${k}`,
          employeeId: empId,
          employeeName: empName,
          date,
          hour: Number.isFinite(hour) ? hour : undefined,
          text,
          timestamp:
            isYYYYMMDD(date) && Number.isFinite(hour)
              ? nepalISO(date, hour)
              : new Date(doc?.updatedAt ?? Date.now()).toISOString(),
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  return [];
}

/**
 * Minimal guard: cookie existence.
 * Replace with real verification if you have JWT verification elsewhere.
 */
function requireAdmin(req: NextRequest) {
  const token = req.cookies.get("admin_token")?.value;
  return !!token;
}

export async function GET(req: NextRequest) {
  try {
    if (!requireAdmin(req)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const url = new URL(req.url);
    const date = url.searchParams.get("date") || "";
    const employeeId = url.searchParams.get("employeeId") || "";

    if (!date || !isYYYYMMDD(date)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing date. Use YYYY-MM-DD." },
        { status: 400 }
      );
    }

    const q: any = { date };
    if (employeeId) q.employeeId = employeeId;

    const days = await WorkbookDay.find(q)
      .populate("employeeId", "name position")
      .lean();

    const items = days.map((doc: any) => {
      const empId = String(doc?.employeeId?._id ?? doc?.employeeId ?? "");
      return {
        employeeId: empId,
        employeeName: pickEmployeeName(doc),
        todos: normalizeTodos(doc),
        hourlyLogs: normalizeHourlyLogs(doc), // now sessions-first
      };
    });

    items.sort((a: any, b: any) => (a.employeeName || "").localeCompare(b.employeeName || ""));

    return NextResponse.json({ success: true, items });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to load worklogs" },
      { status: 500 }
    );
  }
}
