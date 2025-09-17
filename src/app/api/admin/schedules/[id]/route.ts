import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import NotificationSchedule from '@/models/NotificationSchedule';
import { Client } from '@upstash/qstash';

export const runtime = 'nodejs';

const q = new Client({ token: process.env.QSTASH_TOKEN! });

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // Next.js 15.5: params is a Promise
) {
  const { id } = await context.params; // ✅ await to get route param
  try {
    await dbConnect();

    // --- Auth ---
    const hdr = req.headers.get('x-admin-token');
    if (hdr !== process.env.ADMIN_TOKEN) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // --- Find schedule in DB ---
    const s = await NotificationSchedule.findById(id);
    if (!s) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }

    // --- Delete from QStash ---
    try {
      await q.schedules.delete(String(s.scheduleId || id));
    } catch (err) {
      // If it's already gone in QStash, ignore
      console.warn('[DELETE schedule] QStash delete error (ignored):', err);
    }

    // --- Mark inactive locally ---
    s.active = false;
    await s.save();

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Delete failed' },
      { status: 500 }
    );
  }
}
