// app/api/reports/daily/route.ts
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import Task from '@/models/Task';
import Employee from '@/models/Employee';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_change_me';

function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('admin_token')?.value;
  if (!token) return { ok: false as const, error: 'Unauthorized' };
  try {
    const p = jwt.verify(token, JWT_SECRET) as { role: string; username: string };
    if (p?.role !== 'Admin') return { ok: false as const, error: 'Forbidden' };
    return { ok: true as const, admin: p };
  } catch {
    return { ok: false as const, error: 'Invalid token' };
  }
}

function dayRangeUTC(yyyy_mm_dd: string) {
  const start = new Date(`${yyyy_mm_dd}T00:00:00.000Z`);
  const end   = new Date(`${yyyy_mm_dd}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

export async function GET(req: NextRequest) {
  // auth
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  }

  try {
    await dbConnect();

    const dateStr = new URL(req.url).searchParams.get('date') || '';
    const range = dayRangeUTC(dateStr);
    if (!range) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid ?date=YYYY-MM-DD' },
        { status: 400 }
      );
    }

    /* ---------------- Attendance (no populate; manual join) ---------------- */
    let attendance: Array<{
      _id: string;
      employeeId: string;
      employeeName: string;
      type: 'checkin' | 'checkout';
      timestamp: Date;
      imageData: string | null;
      createdAt: Date | undefined;
    }> = [];

    try {
      const attRows = await Attendance.find(
        { timestamp: { $gte: range.start, $lte: range.end } },
        { employeeId: 1, type: 1, timestamp: 1, imageData: 1, createdAt: 1 }
      ).sort({ timestamp: 1 }).lean();

      const empIds = Array.from(
        new Set(
          attRows
            .map((a: any) =>
              a.employeeId?._id?.toString?.() ??
              (typeof a.employeeId === 'object' ? a.employeeId.toString?.() : String(a.employeeId))
            )
            .filter(Boolean)
        )
      );

      const employees = await Employee.find(
        { _id: { $in: empIds } },
        { name: 1 }
      ).lean();

      const nameMap = new Map<string, string>();
      for (const e of employees as any[]) {
        nameMap.set(String(e._id), String(e.name ?? 'Unknown'));
      }

      attendance = (attRows as any[]).map((a) => {
        const id =
          a.employeeId?._id?.toString?.() ??
          (typeof a.employeeId === 'object' ? a.employeeId.toString?.() : String(a.employeeId));
        return {
          _id: String(a._id),
          employeeId: String(id),
          employeeName: nameMap.get(String(id)) ?? 'Unknown',
          type: a.type,
          timestamp: a.timestamp,
          imageData: a.imageData ?? null,
          createdAt: a.createdAt,
        };
      });
    } catch (attErr) {
      console.error('Daily report: attendance query failed:', attErr);
      attendance = [];
    }

    /* ---------------- Progress updates (best effort) ---------------- */
    let progress: Array<{
      taskId: string;
      taskTitle: string;
      assignedTo: string;    // employee _id
      employeeName: string;  // assignee name
      message: string;
      timestamp: string;     // ISO
    }> = [];

    try {
      const taskRows = await Task.find(
        { 'progressUpdates.timestamp': { $gte: range.start, $lte: range.end } },
        { title: 1, assignedTo: 1, progressUpdates: 1 }
      ).lean();

      // fetch assignee names in one go
      const assigneeIds = Array.from(
        new Set(
          (taskRows as any[]).map((t) =>
            t.assignedTo?._id?.toString?.() ??
            (typeof t.assignedTo === 'object' ? t.assignedTo.toString?.() : String(t.assignedTo))
          )
        )
      ).filter(Boolean);

      const assignees = await Employee.find({ _id: { $in: assigneeIds } }, { name: 1 }).lean();
      const assigneeNameMap = new Map<string, string>();
      for (const e of assignees as any[]) {
        assigneeNameMap.set(String(e._id), String(e.name ?? 'Employee'));
      }

      for (const t of taskRows as any[]) {
        const taskTitle = t.title ?? 'Task';
        const assignedToId =
          t.assignedTo?._id?.toString?.() ??
          (typeof t.assignedTo === 'object' ? t.assignedTo.toString?.() : String(t.assignedTo));
        const assignedToName = assigneeNameMap.get(String(assignedToId)) ?? 'Employee';

        if (Array.isArray(t.progressUpdates)) {
          for (const u of t.progressUpdates) {
            const time = new Date(u?.timestamp);
            if (!Number.isNaN(time.getTime()) &&
                time >= range.start && time <= range.end) {
              progress.push({
                taskId: String(t._id),
                taskTitle,
                assignedTo: String(assignedToId),
                employeeName: assignedToName,
                message: String(u?.message ?? ''),
                timestamp: time.toISOString(),
              });
            }
          }
        }
      }

      progress.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } catch (progErr) {
      console.error('Daily report: progress scan failed (returning empty list):', progErr);
      progress = [];
    }

    return NextResponse.json({ success: true, attendance, progress }, { status: 200 });
  } catch (e: any) {
    console.error('GET /api/reports/daily error:', e);
    return NextResponse.json(
      { success: false, error: 'Failed to load daily report', details: e?.message },
      { status: 500 }
    );
  }
}
