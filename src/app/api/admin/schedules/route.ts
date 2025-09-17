import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import NotificationSchedule from '@/models/NotificationSchedule';
import { Types } from 'mongoose';
import { Client } from '@upstash/qstash';

export const runtime = 'nodejs';

const client = new Client({ token: process.env.QSTASH_TOKEN! });

// helper: every N minutes, in a specific TZ (QStash honors CRON_TZ=…)
function cronEveryMinutes(n: number, tz: string) {
  const step = Math.max(1, Math.min(60, Math.floor(Number(n) || 1)));
  return `CRON_TZ=${tz} */${step} * * * *`;
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    // ---- simple admin guard via header token (server-to-server) ----
    const hdr = req.headers.get('x-admin-token');
    if (!process.env.ADMIN_TOKEN || hdr !== process.env.ADMIN_TOKEN) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // ---- input ----
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

    const start = new Date(startAt);
    const stop  = new Date(stopAt);
    if (isNaN(start.getTime()) || isNaN(stop.getTime()) || stop <= start) {
      return NextResponse.json({ ok: false, error: 'Invalid startAt/stopAt' }, { status: 400 });
    }

    const every = Number(everyMinutes);
    if (!Number.isFinite(every) || every < 1 || every > 60) {
      return NextResponse.json({ ok: false, error: 'everyMinutes must be 1–60' }, { status: 400 });
    }

    // ---- create DB row (we’ll reuse _id as scheduleId) ----
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

    // ---- QStash schedule ----
    // IMPORTANT: APP_URL must be public (Vercel / tunnel); QStash cannot call localhost.
    const destination = new URL('/api/schedules/tick', process.env.APP_URL!).toString();

    const created = await client.schedules.create({
      destination,
      cron: cronEveryMinutes(every, tz),
      notBefore: start.toISOString(),   // don’t run before start
      expiresAt: stop.toISOString(),    // auto stop after stopAt
      scheduleId: String(doc._id),      // stable id

      // Send minimal JSON body each tick (cleaner than query strings)
      body: JSON.stringify({
        scheduleId: String(doc._id),
        employeeId: String(employeeId),
        title: String(title),
        body: String(body),
        url: url || undefined,
      }),

      // Correct way to forward headers with QStash:
      // QStash will strip the 'Upstash-Forward-' prefix and deliver 'x-admin-token' to your tick route.
      headers: {
        'Upstash-Forward-x-admin-token': process.env.ADMIN_TOKEN!,
        'Content-Type': 'application/json',
      },
    });

    await NotificationSchedule.updateOne(
      { _id: doc._id },
      { $set: { scheduleId: created.scheduleId ?? String(doc._id) } },
    );

    // Optional: log for debugging
    // console.log('[schedule-created]', {
    //   id: created.scheduleId,
    //   destination,
    //   cron: cronEveryMinutes(every, tz),
    //   notBefore: start.toISOString(),
    //   expiresAt: stop.toISOString(),
    // });

    return NextResponse.json(
      {
        ok: true,
        schedule: { ...doc.toObject(), scheduleId: created.scheduleId ?? String(doc._id) },
      },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Create failed' },
      { status: 500 }
    );
  }
}
