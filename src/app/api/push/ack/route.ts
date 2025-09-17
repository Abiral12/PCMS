import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Notification from '@/models/Notification';
import NotificationDelivery from '@/models/NotificationDelivery';
import { Types } from 'mongoose';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    // Optional: if you want to ensure the employee matches
    const headerEmployeeId = (req.headers.get('x-user-id') || '').trim();

    // Accept both shapes:
    // - deliveryId / deliveryIds  (preferred for Delivery table)
    // - id / ids                  (back-compat: your Notification ids)
    const body = await req.json().catch(() => ({} as any));
    const deliveryIdsInput: string[] = Array.isArray(body.deliveryIds)
      ? body.deliveryIds
      : body.deliveryId
        ? [String(body.deliveryId)]
        : [];

    const notifIdsInput: string[] = Array.isArray(body.ids)
      ? body.ids
      : body.id
        ? [String(body.id)]
        : [];

    if (!deliveryIdsInput.length && !notifIdsInput.length) {
      return NextResponse.json({ ok: false, error: 'No ids provided' }, { status: 400 });
    }

    const now = new Date();

    // --- 1) Ack via Delivery ids (best path)
    let deliveriesMatched = 0;
    let deliveriesModified = 0;
    let relatedNotifIds: string[] = [];

    if (deliveryIdsInput.length) {
      const deliveryObjIds: Types.ObjectId[] = [];
      for (const s of deliveryIdsInput) {
        try { deliveryObjIds.push(new Types.ObjectId(String(s))); } catch {}
      }

      // First, get the deliveries (to collect notificationId and check employee)
      const deliveries = await NotificationDelivery.find({
        _id: { $in: deliveryObjIds },
        ...(headerEmployeeId ? { employeeId: headerEmployeeId } : {}),
      }, { _id: 1, notificationId: 1 }).lean();

      if (deliveries.length) {
        relatedNotifIds = deliveries
          .map(d => (d.notificationId ? String(d.notificationId) : ''))
          .filter(Boolean);

        const res = await NotificationDelivery.updateMany(
          {
            _id: { $in: deliveries.map(d => d._id) },
            status: { $ne: 'acked' },
          },
          { $set: { status: 'acked', ackedAt: now } }
        );

        
        deliveriesMatched = res.matchedCount ?? 0;
       
        deliveriesModified = res.modifiedCount ?? 0;
      }
    }

    // --- 2) Back-compat: Ack via Notification ids (your existing flow)
    let notifMatched = 0;
    let notifModified = 0;

    if (notifIdsInput.length) {
      // If your Notification._id is a string, this works as-is.
      // If it's ObjectId, switch to casting with Types.ObjectId like we did for deliveries.
      const filter: Record<string, any> = { _id: { $in: notifIdsInput } };
      if (headerEmployeeId) filter.toEmployeeId = headerEmployeeId;

      const res = await Notification.updateMany(filter, { $set: { read: true } });
      
      notifMatched = res.matchedCount ?? 0;
      
      notifModified = res.modifiedCount ?? 0;

      // Also ack deliveries that reference these Notification ids (if any)
      // (This allows older clients that only send Notification ids to still mark deliveries as acked)
      if (notifIdsInput.length) {
        await NotificationDelivery.updateMany(
          {
            notificationId: { $in: notifIdsInput.map(id => {
              try { return new Types.ObjectId(String(id)); } catch { return null as any; }
            }).filter(Boolean) },
            ...(headerEmployeeId ? { employeeId: headerEmployeeId } : {}),
            status: { $ne: 'acked' },
          },
          { $set: { status: 'acked', ackedAt: now } }
        );
      }
    }

    // If we came with deliveryId(s) and they referenced Notification(s), mark those as read too
    if (relatedNotifIds.length) {
      const res = await Notification.updateMany(
        {
          _id: { $in: relatedNotifIds },
          ...(headerEmployeeId ? { toEmployeeId: headerEmployeeId } : {}),
        },
        { $set: { read: true } }
      );
      
      notifMatched += res.matchedCount ?? 0;
      
      notifModified += res.modifiedCount ?? 0;
    }

    return NextResponse.json({
      ok: true,
      deliveries: { matched: deliveriesMatched, modified: deliveriesModified },
      notifications: { matched: notifMatched, modified: notifModified },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Ack failed' }, { status: 500 });
  }
}
