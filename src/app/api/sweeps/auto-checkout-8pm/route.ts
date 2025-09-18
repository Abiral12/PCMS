import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { Types } from 'mongoose';

export const runtime = 'nodejs';

// Nepal offset is +05:45 (no DST)
const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;

function nepalDayBounds(ref = new Date()) {
  const utcMs = ref.getTime();
  const localMs = utcMs + NEPAL_OFFSET_MS;        // convert to Nepal local "clock"
  const L = new Date(localMs);
  // local midnight → back to UTC
  const startUTCms = Date.UTC(L.getUTCFullYear(), L.getUTCMonth(), L.getUTCDate()) - NEPAL_OFFSET_MS;
  const endUTCms   = startUTCms + 24 * 60 * 60 * 1000 - 1;
  return { startUTC: new Date(startUTCms), endUTC: new Date(endUTCms) };
}

function eightPmNepalUTC(ref = new Date()) {
  const utcMs = ref.getTime();
  const localMs = utcMs + NEPAL_OFFSET_MS;
  const L = new Date(localMs);
  const localMidnightUTCms = Date.UTC(L.getUTCFullYear(), L.getUTCMonth(), L.getUTCDate()) - NEPAL_OFFSET_MS;
  // 20:00 local = start + 20h (in UTC ms)
  return new Date(localMidnightUTCms + 20 * 60 * 60 * 1000);
}

// idempotent "create checkout at 20:00 if today's last record is checkin"
async function forceCheckoutAt8PMForDay(employeeId: string, dayRef = new Date()) {
  const eid = new Types.ObjectId(employeeId);
  const { startUTC, endUTC } = nepalDayBounds(dayRef);

  // Last attendance today
  const last = await Attendance
    .findOne({ employeeId: eid, timestamp: { $gte: startUTC, $lte: endUTC } })
    .sort({ timestamp: -1 })
    .select({ type: 1, timestamp: 1 })
    .lean<{ type: 'checkin' | 'checkout'; timestamp: Date } | null>();

  if (!last || last.type === 'checkout') return { created: false };

  // Check we didn’t already write an auto checkout at/after 20:00
  const eightUTC = eightPmNepalUTC(dayRef);
  const already = await Attendance.exists({
    employeeId: eid,
    type: 'checkout',
    timestamp: { $gte: eightUTC, $lte: endUTC },
    reason: 'auto-8pm',
  });
  if (already) return { created: false };

  await Attendance.create({
    employeeId: eid,
    type: 'checkout',
    timestamp: eightUTC,   // timestamp exactly 20:00 local
    reason: 'auto-8pm',
    createdAt: new Date(),
  });

  return { created: true };
}

// QStash will call this at 20:00 Nepal time (see the scheduler below)
export const POST = verifySignatureAppRouter(async (req: NextRequest) => {
  await dbConnect();

  // Require forwarded admin header (QStash will forward what we set in the schedule)
  const admin = req.headers.get('x-admin-token') || '';
  if (process.env.ADMIN_TOKEN && admin !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // You can target specific employees via body.employees; if empty, sweep everyone with a checkin today.
  const body = await req.json().catch(() => ({} as any));
  const targetIds: string[] = Array.isArray(body?.employees) ? body.employees.map(String) : [];

  const { startUTC, endUTC } = nepalDayBounds(new Date());
  const matchBase: any = { timestamp: { $gte: startUTC, $lte: endUTC } };
  if (targetIds.length) matchBase.employeeId = { $in: targetIds.map(id => new Types.ObjectId(id)) };

  // Aggregate: for today, get last record per employee
  const lastByEmp = await Attendance.aggregate([
    { $match: matchBase },
    { $sort: { timestamp: 1 } },
    { $group: { _id: '$employeeId', lastType: { $last: '$type' } } },
    { $match: { lastType: 'checkin' } },
  ]);

  let forced = 0;
  for (const row of lastByEmp) {
    const eid = String(row._id);
    const res = await forceCheckoutAt8PMForDay(eid, new Date());
    if (res.created) forced++;
  }

  return NextResponse.json({ ok: true, processed: lastByEmp.length, forced });
});
