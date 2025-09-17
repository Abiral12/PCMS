// /app/api/notifications/sweep/route.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import NotificationDelivery from '@/models/NotificationDelivery';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  await dbConnect();
  const hdr = req.headers.get('x-admin-token');
  if (process.env.ADMIN_TOKEN && hdr !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  const toExpire = await NotificationDelivery.find({
    status: 'sent',
    expiresAt: { $lte: now },
  }).lean();

  let forced = 0;
  for (const d of toExpire) {
    await NotificationDelivery.updateOne(
      { _id: d._id, status: 'sent' },
      { $set: { status: 'expired', forcedCheckoutAt: new Date() } }
    );

    // call your own force-checkout (implement this to match your attendance schema)
    await fetch(`${(process.env.APP_URL || '').replace(/\/+$/, '')}/api/admin/attendance/force-checkout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-token': process.env.ADMIN_TOKEN || '',
      },
      body: JSON.stringify({
        employeeId: d.employeeId,
        reason: 'Auto checkout (no acknowledgement in 15 minutes)',
        deliveryId: String(d._id),
      }),
    });
    forced++;
  }

  return NextResponse.json({ ok: true, forced, checked: toExpire.length });
}
