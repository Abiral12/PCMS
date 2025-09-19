import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import NotificationSchedule from '@/models/NotificationSchedule';
import { Types } from 'mongoose';
import { Client } from '@upstash/qstash';

export const runtime = 'nodejs';

const client = new Client({ token: process.env.QSTASH_TOKEN! });

// helper: every N minutes in a specific TZ (QStash honors CRON_TZ=…)
function cronEveryMinutes(n: number, tz: string) {
  const step = Math.max(1, Math.min(60, Math.floor(Number(n) || 1)));
  return `CRON_TZ=${tz} */${step} * * * *`;
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    // --- simple admin guard via header token (server-to-server) ---
    const hdr = req.headers.get('x-admin-token');
    if (!process.env.ADMIN_TOKEN || hdr !== process.env.ADMIN_TOKEN) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // --- input ---
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

    // --- create DB row (reuse _id as scheduleId) ---
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

    // --- QStash schedule (no notBefore/expiresAt in this SDK) ---
    const destination = new URL('/api/schedules/tick', process.env.APP_URL!).toString();

    const created = await client.schedules.create({
      destination,
      cron: cronEveryMinutes(every, tz),
      scheduleId: String(doc._id), // stable id

      // delivered to tick on every run (avoid query strings)
      body: JSON.stringify({
        scheduleId: String(doc._id),
        employeeId: String(employeeId),
        title: String(title),
        body: String(body),
        url: url || undefined,
      }),

      // forward admin header to tick (QStash strips the prefix)
      headers: {
        'Upstash-Forward-x-admin-token': process.env.ADMIN_TOKEN!,
        'Content-Type': 'application/json',
      },
    });

    // store the (possibly re-generated) schedule id
    await NotificationSchedule.updateOne(
      { _id: doc._id },
      { $set: { scheduleId: created.scheduleId ?? String(doc._id) } },
    );

    // (Optional) log for debugging:
    // console.log('[schedule-created]', { id: created.scheduleId, destination, cron: cronEveryMinutes(every, tz) });

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


export async function GET(_req: NextRequest) {
  await dbConnect();
  const schedules = await NotificationSchedule
    .find({})
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  // normalize ids to strings for the client
  const list = schedules.map(s => ({ ...s, _id: String(s._id), employeeId: String(s.employeeId) }));
  return NextResponse.json({ ok: true, schedules: list });
}

export async function DELETE(req: NextRequest) {
  try {
    await dbConnect();

    // --- admin guard ---
    const hdr = req.headers.get('x-admin-token');
    if (!process.env.ADMIN_TOKEN || hdr !== process.env.ADMIN_TOKEN) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
    }

    const schedule = await NotificationSchedule.findById(id);
    if (!schedule) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }

    // cancel schedule from QStash as well
    if (schedule.scheduleId) {
      try {
        await client.schedules.delete(schedule.scheduleId);
      } catch (e) {
        console.warn('QStash delete failed', e);
      }
    }

    await NotificationSchedule.deleteOne({ _id: id });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Delete failed' },
      { status: 500 }
    );
  }
}

