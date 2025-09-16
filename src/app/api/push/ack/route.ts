import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Notification from '@/models/Notification';
import type { UpdateResult } from 'mongodb';
// If you need to coerce ids to ObjectId:
// import { Types } from 'mongoose';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const headerId = req.headers.get('x-user-id')?.trim() || '';
    const { id, ids } = await req.json().catch(() => ({} as { id?: string; ids?: string[] }));

    const toAck: string[] = Array.isArray(ids) ? ids : (id ? [id] : []);
    if (toAck.length === 0) {
      return NextResponse.json({ ok: false, error: 'No ids provided' }, { status: 400 });
    }

    // If your _id is ObjectId, uncomment to cast:
    // const ackIds = toAck.filter(Boolean).map(s => new Types.ObjectId(String(s)));

    const filter: Record<string, any> = {
      _id: { $in: toAck },      // use ackIds instead if casting
    };
    if (headerId) filter.toEmployeeId = headerId;

    const res = (await Notification.updateMany(
      filter,
      { $set: { read: true } }
    )) as UpdateResult;

    if (!res.acknowledged) {
      return NextResponse.json({ ok: false, error: 'Write not acknowledged' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      matched: res.matchedCount,
      modified: res.modifiedCount,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Ack failed' }, { status: 500 });
  }
}
