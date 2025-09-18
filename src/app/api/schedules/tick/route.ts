import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import NotificationSchedule from '@/models/NotificationSchedule';
import NotificationDelivery from '@/models/NotificationDelivery';
import Attendance from '@/models/Attendance'; // <-- your attendance model
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { Types } from 'mongoose';

export const runtime = 'nodejs';

type AttendanceLean = {
  _id: Types.ObjectId;
  type: 'checkin' | 'checkout';   // <-- adjust if your schema uses a different field
  timestamp: Date;
};

// helper: create a forced checkout only if the last record isn't already a checkout
async function ensureForcedCheckout(employeeId: string, at: Date) {
  const dayStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), 0, 0, 0, 0));
  const dayEnd   = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), 23, 59, 59, 999));

  const eid = new Types.ObjectId(employeeId);

  // ✅ get a single doc; project only needed fields; provide Lean generic
  const last = await Attendance
    .findOne(
      { employeeId: eid, timestamp: { $gte: dayStart, $lte: dayEnd } },
      { type: 1, timestamp: 1 }               // projection
    )
    .sort({ timestamp: -1 })
    .lean<AttendanceLean | null>();

  if (last?.type === 'checkout') return false;

  await Attendance.create({
    employeeId: eid,
    type: 'checkout',                         // <-- adjust if your schema differs
    timestamp: at,
    createdAt: new Date(),
  });

  return true;
}
// QStash will POST here each minute
export const POST = verifySignatureAppRouter(async (req: NextRequest) => {
  await dbConnect();

  // 1) Admin header check (QStash forwards it)
  const admin = req.headers.get('x-admin-token') || '';
  if (process.env.ADMIN_TOKEN && admin !== process.env.ADMIN_TOKEN) {
    console.warn('[tick] 401 admin token mismatch');
    return NextResponse.json({ ok: false, error: 'Unauthorized (admin)' }, { status: 401 });
  }

  // 2) Payload (sent when schedule was created)
  const payload = await req.json().catch(() => ({} as any));
  const { scheduleId, employeeId, title, body, url } = payload || {};
  if (!scheduleId) {
    console.warn('[tick] 400 missing scheduleId');
    return NextResponse.json({ ok: false, error: 'Missing scheduleId' }, { status: 400 });
  }

  // 3) Load schedule
  const schedule = await NotificationSchedule.findById(scheduleId);
  if (!schedule) {
    console.warn('[tick] 404 schedule not found', scheduleId);
    return NextResponse.json({ ok: false, error: 'Schedule not found' }, { status: 404 });
  }

  // 4) Window & active checks
  const now = new Date();
  if (!schedule.active) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'inactive' });
  }
  if (now < schedule.startAt) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'before-start' });
  }
  if (now > schedule.stopAt) {
    await NotificationSchedule.updateOne({ _id: schedule._id }, { $set: { active: false } });
    return NextResponse.json({ ok: true, skipped: true, reason: 'after-stop' });
  }

  // 5) Send push through your existing endpoint
  const res = await fetch(`${(process.env.APP_URL || '').replace(/\/+$/, '')}/api/push/send`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': process.env.ADMIN_TOKEN || '',
    },
    body: JSON.stringify({
      scheduleId: String(schedule._id),
      employeeIds: [String(employeeId ?? schedule.employeeId)],
      title: title ?? schedule.title,
      body:  body  ?? schedule.body,
      url:   url   ?? schedule.url,
    }),
  });

  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j?.ok) {
    console.error('[tick] push send failed', res.status, j);
    return NextResponse.json({ ok: false, error: 'Push send failed', detail: j }, { status: 500 });
  }

  // 6) ENFORCE: expire & force-checkout
  const eid = String(employeeId ?? schedule.employeeId);

  // any deliveries for this schedule/employee that have passed expiresAt and are still "sent"
  const expired = await NotificationDelivery.find({
    scheduleId: schedule._id,
    employeeId: eid,
    status: 'sent',
    expiresAt: { $lte: now },
  }).lean();

  let forced = 0;
  for (const d of expired) {
    // mark expired + remember we forced
    await NotificationDelivery.updateOne(
      { _id: d._id },
      { $set: { status: 'expired', forcedCheckoutAt: now, updatedAt: now } }
    );
    // create a forced checkout once per day if needed
    const didForce = await ensureForcedCheckout(eid, d.expiresAt ?? now);
    if (didForce) forced++;
  }

  return NextResponse.json({ ok: true, sent: j.sent ?? 1, expiredProcessed: expired.length, forcedCheckouts: forced });
});
