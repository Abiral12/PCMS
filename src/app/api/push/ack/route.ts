import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Notification from '@/models/Notification';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const headerId = req.headers.get('x-user-id')?.trim() || '';
    const { id, ids } = await req.json().catch(() => ({}));

    const toAck: string[] = Array.isArray(ids) ? ids : (id ? [id] : []);
    if (!toAck.length) {
      return NextResponse.json({ ok: false, error: 'No ids provided' }, { status: 400 });
    }

    // optional safety: require x-user-id to match toEmployeeId
    const filter: any = { _id: { $in: toAck } };
    if (headerId) filter.toEmployeeId = headerId;

    const res = await Notification.updateMany(filter, { $set: { read: true } });
    return NextResponse.json({ ok: true, matched: res.matchedCount ?? res.n, modified: res.modifiedCount ?? res.nModified });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Ack failed' }, { status: 500 });
  }
}
