import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import NotificationSchedule from '@/models/NotificationSchedule';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';

export const runtime = 'nodejs';

// QStash will POST here each minute
export const POST = verifySignatureAppRouter(async (req: NextRequest) => {
  await dbConnect();

  // 1) Forwarded admin header (must match Vercel env)
  const admin = req.headers.get('x-admin-token') || '';
  if (process.env.ADMIN_TOKEN && admin !== process.env.ADMIN_TOKEN) {
    console.warn('[tick] 401 admin token mismatch');
    return NextResponse.json({ ok: false, error: 'Unauthorized (admin)' }, { status: 401 });
    // NOTE: If you created the schedule before setting ADMIN_TOKEN on Vercel,
    // delete & recreate the schedule from Vercel so QStash forwards the right token.
  }

  // 2) Read payload we attached when scheduling
  const payload = await req.json().catch(() => ({} as any));
  const { scheduleId, employeeId, title, body, url } = payload || {};
  if (!scheduleId) {
    console.warn('[tick] 400 missing scheduleId');
    return NextResponse.json({ ok: false, error: 'Missing scheduleId' }, { status: 400 });
  }

  // 3) Load schedule from DB
  const schedule = await NotificationSchedule.findById(scheduleId);
  if (!schedule) {
    console.warn('[tick] 404 schedule not found', scheduleId);
    return NextResponse.json({ ok: false, error: 'Schedule not found' }, { status: 404 });
  }

  // 4) Window & active checks
  const now = new Date();
  if (!schedule.active) {
    console.log('[tick] skipped inactive', scheduleId);
    return NextResponse.json({ ok: true, skipped: true, reason: 'inactive' });
  }
  if (now < schedule.startAt) {
    console.log('[tick] skipped before startAt', scheduleId, schedule.startAt.toISOString());
    return NextResponse.json({ ok: true, skipped: true, reason: 'before-start' });
  }
  if (now > schedule.stopAt) {
    await NotificationSchedule.updateOne({ _id: schedule._id }, { $set: { active: false } });
    console.log('[tick] auto-disabled after stopAt', scheduleId, schedule.stopAt.toISOString());
    return NextResponse.json({ ok: true, skipped: true, reason: 'after-stop' });
  }

  // 5) Log a heartbeat so you can see 1/min in Vercel logs
  console.log('[tick] firing', {
    scheduleId: String(schedule._id),
    when: now.toISOString(),
    employeeId: employeeId ?? schedule.employeeId,
  });

  // 6) Send push via your existing endpoint
  const base = (process.env.APP_URL || '').replace(/\/+$/, '');
// AFTER — always send an array (and cast to string)
const targetId = String(employeeId ?? schedule.employeeId);

const res = await fetch(`${(process.env.APP_URL || '').replace(/\/+$/, '')}/api/push/send`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-admin-token': process.env.ADMIN_TOKEN || '',
  },
  body: JSON.stringify({
    title: title ?? schedule.title,
    body: body ?? schedule.body,
    url: url ?? schedule.url,
    employeeIds: [targetId],        // ✅ what your push API expects
  }),
});


  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j?.ok) {
    console.error('[tick] push send failed', res.status, j);
    return NextResponse.json({ ok: false, error: 'Push send failed', detail: j }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent: true });
});
