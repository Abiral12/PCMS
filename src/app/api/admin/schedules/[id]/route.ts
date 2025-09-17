import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import NotificationSchedule from '@/models/NotificationSchedule';

export const runtime = 'nodejs';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await dbConnect();
    const hdr = req.headers.get('x-admin-token');
    if (hdr !== process.env.ADMIN_TOKEN) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const id = params.id;
    const s = await NotificationSchedule.findById(id);
    if (!s) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

    await fetch(`https://qstash.upstash.io/v2/schedules/${encodeURIComponent(s.scheduleId || id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${process.env.QSTASH_TOKEN}` },
    });

    s.active = false;
    await s.save();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Delete failed' }, { status: 500 });
  }
}
