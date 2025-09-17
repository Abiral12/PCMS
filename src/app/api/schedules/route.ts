import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import NotificationSchedule from '@/models/NotificationSchedule';
import { Types } from 'mongoose';
import { Client } from '@upstash/qstash';
import { getAdminFromCookies } from '@/lib/auth';

export const runtime = 'nodejs';

const client = new Client({ token: process.env.QSTASH_TOKEN! });

function cronEveryMinutes(n: number, tz: string) {
  const step = Math.max(1, Math.min(60, Math.floor(Number(n) || 1)));
  return `CRON_TZ=${tz} */${step} * * * *`;
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    // ---- Auth: header token OR cookie-based admin (role==='admin') ----
    const hdr = req.headers.get('x-admin-token');
    const headerOk = !!process.env.ADMIN_TOKEN && hdr === process.env.ADMIN_TOKEN;

    const adminUser = await getAdminFromCookies?.(req);
    const role =
      typeof adminUser?.role === 'string' ? adminUser.role.toLowerCase() : undefined;
    const sessionOk = role === 'admin';

    if (!headerOk && !sessionOk) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // ---- Input ----
    const {
      employeeId,
      title,
      body,
      url,
      everyMinutes,
      startAt,
      stopAt,
      tz = 'Asia/Kathmandu',
      createdBy,
    } = await req.json();

    if (!employeeId || !title || !body || !everyMinutes || !startAt || !stopAt) {
      return NextResponse.json({ ok: false, error: 'Missing fields' }, { status: 400 });
    }

    const every = Number(everyMinutes);
    if (!Number.isFinite(every) || every < 1 || every > 60) {
      return NextResponse.json({ ok: false, error: 'everyMinutes must be 1–60' }, { status: 400 });
    }

    const start = new Date(startAt);
    const stop  = new Date(stopAt);
    if (isNaN(start.getTime()) || isNaN(stop.getTime()) || stop <= start) {
      return NextResponse.json({ ok: false, error: 'Invalid startAt/stopAt' }, { status: 400 });
    }

    // ---- Create DB row (reuse _id as scheduleId) ----
    const _id = new Types.ObjectId();
    const doc = await NotificationSchedule.create({
      _id,
      employeeId: String(employeeId),
      title: String(title).trim(),
      body: String(body).trim(),
      url: url ? String(url) : undefined,
      everyMinutes: every,
      startAt: start,
      stopAt: stop,
      tz,
      active: true,
      createdBy,
    });

    // ---- QStash schedule (SDK: no notBefore/expiresAt here) ----
    // NOTE: APP_URL must be a public URL (Vercel or tunnel) for QStash to reach it.
    const destination = new URL('/api/schedules/tick', process.env.APP_URL!).toString();

    const created = await client.schedules.create({
      destination,
      cron: cronEveryMinutes(every, tz),
      scheduleId: String(doc._id),

      // Body delivered on every tick (avoid query strings)
      body: JSON.stringify({
        scheduleId: String(doc._id),
        employeeId: String(employeeId),
        title: String(title),
        body: String(body),
        url: url || undefined,
      }),

      // Forward admin header to tick route (QStash strips the prefix)
      headers: {
        'Upstash-Forward-x-admin-token': process.env.ADMIN_TOKEN ?? '',
        'Content-Type': 'application/json',
      },
    });

    await NotificationSchedule.updateOne(
      { _id: doc._id },
      { $set: { scheduleId: created.scheduleId ?? String(doc._id) } },
    );

    return NextResponse.json(
      { ok: true, schedule: { ...doc.toObject(), scheduleId: created.scheduleId ?? String(doc._id) } },
      { status: 201 },
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Create failed' }, { status: 500 });
  }
}
