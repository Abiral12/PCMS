import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Notification from '@/models/Notification';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbConnect();

    const _id = (params?.id || '').trim();
    if (!_id) return NextResponse.json({ ok: false, error: 'No id' }, { status: 400 });

    const res = await Notification.updateOne({ _id }, { $set: { read: true } });
    if ((res.matchedCount ?? res.n) === 0) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, modified: res.modifiedCount ?? res.nModified });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Ack failed' }, { status: 500 });
  }
}
