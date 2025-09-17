import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import NotificationSchedule from '@/models/NotificationSchedule';
import { Types } from 'mongoose';
import { Client } from '@upstash/qstash';

export const runtime = 'nodejs';

const q = new Client({ token: process.env.QSTASH_TOKEN! });

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    // simple admin auth (same pattern you used for /api/push/send)
    const hdr = req.headers.get('x-admin-token');
    if (hdr !== process.env.ADMIN_TOKEN) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { employeeId, title, body, url, everyMinutes, startAt, stopAt } = await req.json();

    if (!employeeId || !title || !body || !everyMinutes || !startAt || !stopAt) {
      return NextResponse.json({ ok: false, error: 'Missing fields' }, { status: 400 });
    }

    // create schedule row (we’ll use its _id as scheduleId in QStash)
    const _id = new Types.ObjectId();
    const doc = await NotificationSchedule.create({
      _id,
      employeeId: String(employeeId),
      title: String(title).trim(),
      body: String(body).trim(),
      url: url ? String(url) : undefined,
      everyMinutes: Number(everyMinutes),
      startAt: new Date(startAt), // MUST be absolute UTC
      stopAt: new Date(stopAt),   // MUST be absolute UTC
      active: true,
    });

    const cron = `*/${doc.everyMinutes} * * * *`; // “every N minutes” in UTC

    const destination =
      new URL('/api/schedules/tick', process.env.APP_URL!).toString() + `?scheduleId=${doc._id}`;

    const created = await q.schedules.create({
      destination,
      cron,
      scheduleId: String(doc._id), // stable id = mongo id
      forwardHeaders: { 'x-admin-token': process.env.ADMIN_TOKEN! }, // forwarded to tick if you want
    });

    await NotificationSchedule.updateOne(
      { _id: doc._id },
      { $set: { scheduleId: created.scheduleId ?? String(doc._id) } },
    );

    return NextResponse.json({ ok: true, schedule: { ...doc.toObject(), scheduleId: created.scheduleId ?? String(doc._id) } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Create failed' }, { status: 500 });
  }
}
