// app/api/schedules/tick/route.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import NotificationSchedule from '@/models/NotificationSchedule';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';

export const runtime = 'nodejs';

// QStash -> this route every minute
export const POST = verifySignatureAppRouter(async (req: NextRequest) => {
  await dbConnect();

  // 1) Admin header (forwarded by QStash)
  const admin = req.headers.get('x-admin-token');
  if (process.env.ADMIN_TOKEN && admin !== process.env.ADMIN_TOKEN) {
    console.warn('[tick] 401 admin token mismatch');
    return NextResponse.json({ ok: false, error: 'Unauthorized (admin)' }, { status: 401 });
  }

  // 2) Parse payload from schedule
  const payload = await req.json().catch(() => ({} as any));
  const { scheduleId, employeeId, title, body, url } = payload || {};
  if (!scheduleId) {
    console.warn('[tick] 400 missing scheduleId');
    return NextResponse.json({ ok: false, error: 'Missing scheduleId' }, { status: 400 });
  }

  // 3) Find schedule in DB
  const schedule = await NotificationSchedule.findOne({ _id: scheduleId });
  if (!schedule) {
    console.warn('[tick] 404 schedule not found', scheduleId);
    return NextResponse.json({ ok: false, error: 'Schedule not found' }, { status: 404 });
  }

  // 4) Enforce active + window
  const now = new Date();
  if (!schedule.active) {
    console.log('[tick] skipped (inactive)', scheduleId);
    return NextResponse.json({ ok: true, skipped: true, reason: 'inactive' });
  }
  if (now < schedule.startAt) {
    console.log('[tick] skipped (before startAt)', scheduleId);
    return NextResponse.json({ ok: true, skipped: true, reason: 'before startAt' });
  }
  if (now > schedule.stopAt) {
    // auto disable after stop
    await NotificationSchedule.updateOne(
      { _id: schedule._id },
      { $set: { active: false } }
    );
    console.log('[tick] auto-disabled (after stopAt)', scheduleId);
    return NextResponse.json({ ok: true, skipped: true, reason: 'after stopAt' });
  }

  // 5) Log that this tick ran (shows in Vercel Logs)
  console.log('[tick] firing', {
    scheduleId: String(schedule._id),
    when: now.toISOString(),
    employeeId: employeeId ?? schedule.employeeId,
  });

  // 6) Send your push via your existing API
  const res = await fetch(`${process.env.APP_URL?.replace(/\/+$/, '')}/api/push/send`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Your push endpoint expects this header too:
      'x-admin-token': process.env.ADMIN_TOKEN || '',
    },
    body: JSON.stringify({
      title: title ?? schedule.title,
      body: body ?? schedule.body,
      url: url ?? schedule.url,
      employeeId: employeeId ?? schedule.employeeId,
    }),
  });

  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j?.ok) {
    console.error('[tick] push send failed', res.status, j);
    return NextResponse.json({ ok: false, error: 'Push send failed', detail: j }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent: true, detail: j });
});
