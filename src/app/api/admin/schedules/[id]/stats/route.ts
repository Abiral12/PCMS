import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import NotificationDelivery from '@/models/NotificationDelivery';
import { Types } from 'mongoose';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await dbConnect();
  const { id } = await ctx.params;

  const oid = Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;

  const rows = await NotificationDelivery.aggregate([
    // match both forms to be safe
    { $match: { $or: [ ...(oid ? [{ scheduleId: oid }] : []), { scheduleId: id } ] } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const by: Record<string, number> = Object.fromEntries(rows.map(r => [r._id as string, r.count as number]));
  const sent    = (by.sent || 0) + (by.acked || 0) + (by.expired || 0);
  const acked   = by.acked   || 0;
  const expired = by.expired || 0;
  const pending = by.sent    || 0;

  return NextResponse.json({ ok: true, stats: { sent, acked, expired, pending, ackRate: sent ? acked / sent : 0 } });
}
