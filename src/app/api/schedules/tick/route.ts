import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import NotificationSchedule from '@/models/NotificationSchedule';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';

export const runtime = 'nodejs';

export const POST = verifySignatureAppRouter(async (req: NextRequest) => {
  await dbConnect();

  // forwarded by QStash (from headers option above)
  const admin = req.headers.get('x-admin-token');
  if (process.env.ADMIN_TOKEN && admin !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ ok: false, error: 'Unauthorized (admin)' }, { status: 401 });
  }

  const payload = await req.json().catch(() => ({}));
  const { scheduleId, employeeId, title, body, url } = payload || {};
  if (!scheduleId) {
    return NextResponse.json({ ok: false, error: 'Missing scheduleId' }, { status: 400 });
  }

  const schedule = await NotificationSchedule.findOne({ _id: scheduleId, active: true });
  if (!schedule) return NextResponse.json({ ok: false, error: 'Schedule not found' }, { status: 404 });

  const now = new Date();
  if (now < schedule.startAt || now > schedule.stopAt) {
    if (now > schedule.stopAt && schedule.active) {
      await NotificationSchedule.updateOne({ _id: schedule._id }, { $set: { active: false } });
    }
    return NextResponse.json({ ok: true, skipped: true });
  }

  // call your existing push sender
  const res = await fetch(`${process.env.APP_URL}/api/push/send`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
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
    return NextResponse.json({ ok: false, error: 'Push send failed', detail: j }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent: true, detail: j });
});
