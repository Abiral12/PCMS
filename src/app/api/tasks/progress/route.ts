// app/api/tasks/progress/route.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Task from '@/models/Task';
import Employee from '@/models/Employee';

interface FlatUpdate {
  taskId: string;
  taskTitle: string;
  assignedTo: string | object;
  message: string;
  timestamp: Date;
}

interface EnrichedUpdate {
  taskId: string;
  taskTitle: string;
  assignedTo: string;
  employeeName: string;
  message: string;
  timestamp: Date;
}

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

    // Parse optional date=YYYY-MM-DD (assumed UTC)
    const dateStr = searchParams.get('date');
    let dayStart: Date | null = null;
    let dayEnd: Date | null = null;

    if (dateStr) {
      const start = new Date(`${dateStr}T00:00:00.000Z`);
      if (!isNaN(start.getTime())) {
        dayStart = start;
        dayEnd = new Date(start.getTime());
        dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      }
    }
// ✅ ADD: support explicit range ?start=ISO&end=ISO (takes precedence over ?date=YYYY-MM-DD)
const startISO = searchParams.get('start');
const endISO = searchParams.get('end');

if (startISO && endISO) {
  const s = new Date(startISO);
  const e = new Date(endISO);
  // only override if both are valid
  if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
    dayStart = s;
    dayEnd = e;
  }
}

    const baseQuery: any = { 'progressUpdates.0': { $exists: true } };

    if (dayStart && dayEnd) {
      baseQuery.progressUpdates = {
        $elemMatch: { timestamp: { $gte: dayStart, $lt: dayEnd } },
      };
    }

    const tasks = await Task.find(baseQuery)
      .select('title assignedTo progressUpdates')
      .lean();

    // Flatten
    const flat: FlatUpdate[] = tasks.flatMap((t: any) => {
      const updates = Array.isArray(t.progressUpdates) ? t.progressUpdates : [];
      const filtered = (dayStart && dayEnd)
        ? updates.filter((u: any) => {
            const ts = new Date(u.timestamp);
            return ts >= dayStart! && ts < dayEnd!;
          })
        : updates;

      return filtered.map(
        (u: any): FlatUpdate => ({
          taskId: String(t._id),
          taskTitle: t.title,
          assignedTo: t.assignedTo,
          message: u.message,
          timestamp: new Date(u.timestamp),
        })
      );
    });

    // Collect employee ids
    const assigneeIds = Array.from(
      new Set(
        flat
          .map((f) =>
            typeof f.assignedTo === 'object' && f.assignedTo !== null
              ? String((f.assignedTo as any)._id ?? f.assignedTo)
              : String(f.assignedTo)
          )
          .filter(Boolean)
      )
    );

    const employees = assigneeIds.length
      ? await Employee.find({ _id: { $in: assigneeIds } })
          .select('_id name')
          .lean()
      : [];

    const nameMap = new Map<string, string>(
      employees.map((e: any) => [String(e._id), e.name])
    );

    // Enrich, sort, limit
    const updates = flat
      .map(
        (u: FlatUpdate): EnrichedUpdate => {
          const id =
            typeof u.assignedTo === 'object' && u.assignedTo !== null
              ? String((u.assignedTo as any)._id ?? u.assignedTo)
              : String(u.assignedTo);

          return {
            taskId: u.taskId,
            taskTitle: u.taskTitle,
            assignedTo: id,
            employeeName: nameMap.get(id) || 'Unknown',
            message: u.message,
            timestamp: u.timestamp,
          };
        }
      )
      .sort(
        (a: EnrichedUpdate, b: EnrichedUpdate) =>
          b.timestamp.getTime() - a.timestamp.getTime()
      )
      .slice(0, limit)
      .map((u) => ({ ...u, timestamp: u.timestamp.toISOString() }));

    return NextResponse.json({ updates }, { status: 200 });
  } catch (err) {
    console.error('Error aggregating progress updates:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
