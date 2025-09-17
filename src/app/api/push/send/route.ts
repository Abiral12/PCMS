// /app/api/push/send/route.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PushSubscription from '@/models/PushSubscription';
import Notification from '@/models/Notification';
import NotificationDelivery from '@/models/NotificationDelivery';
import webpush from 'web-push';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    // ---- admin auth (kept from your code)
    let token = req.cookies.get('admin_token')?.value;
    if (!token) {
      const auth = req.headers.get('authorization') || '';
      const m = auth.match(/^Bearer\s+(.+)$/i);
      if (m) token = m[1];
    }
    const headerOverride = req.headers.get('x-admin-token');
    const isDevBypass =
      headerOverride &&
      (headerOverride === process.env.ADMIN_TOKEN ||
        (process.env.NODE_ENV !== 'production' && headerOverride === 'dev'));

    if (!token && !isDevBypass) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const payload = isDevBypass
      ? { role: 'Admin', username: 'Dev' }
      : (jwt.decode(token as string) as any);
    if (!payload || (payload.role && payload.role !== 'Admin')) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    // ---- input
    const bodyJson = await req.json();
    const {
      employeeIds,
      title,
      body,
      url,
      scheduleId,            // <-- optional when called from /api/schedules/tick
    } = bodyJson || {};

    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return NextResponse.json({ ok: false, error: 'No recipients' }, { status: 400 });
    }
    if (!title || !body) {
      return NextResponse.json({ ok: false, error: 'Title and body required' }, { status: 400 });
    }

    // ---- map employees -> existing Notification _id (created by your UI earlier)
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
    const existingNotifications = await Notification.find({
      toEmployeeId: { $in: employeeIds },
      title,
      body,
      createdAt: { $gte: thirtySecondsAgo },
    }).lean();

    const employeeToNotifId = new Map<string, Types.ObjectId>();
    existingNotifications.forEach((n: any) => {
      employeeToNotifId.set(String(n.toEmployeeId), n._id);
    });
    // fallback id if not found (should be rare)
    employeeIds.forEach((eid: string) => {
      if (!employeeToNotifId.has(String(eid))) {
        employeeToNotifId.set(String(eid), new Types.ObjectId());
      }
    });
    const inserted = existingNotifications.length;

    // ---- create Delivery rows (15 min expiry) and index by employee
    const TTL_MIN = 15;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TTL_MIN * 60 * 1000);

    const deliveryByEmployee = new Map<string, Types.ObjectId>();
    await Promise.all(
      employeeIds.map(async (eid: string) => {
        const delivery = await NotificationDelivery.create({
          scheduleId: scheduleId ? new Types.ObjectId(String(scheduleId)) : null,
          notificationId: employeeToNotifId.get(String(eid)) ?? null,
          employeeId: String(eid),
          title,
          body,
          url,
          status: 'sent',
          sentAt: now,
          expiresAt,
        });
        deliveryByEmployee.set(String(eid), delivery._id as Types.ObjectId);
      })
    );

    // ---- load push subscriptions for recipients
    const validObjectIds = employeeIds
      .map((id: string) => {
        try {
          return new Types.ObjectId(id);
        } catch {
          return null as any;
        }
      })
      .filter(Boolean);

    const subs = validObjectIds.length
      ? await PushSubscription.find({ employeeId: { $in: validObjectIds } }).lean()
      : [];

    // ---- send a push per subscription; include BOTH ids so SW can ack
    const results = await Promise.allSettled(
      subs.map(async (s: any) => {
        const eidStr = String(s.employeeId);
        const notifId = employeeToNotifId.get(eidStr) || new Types.ObjectId();
        const deliveryId = deliveryByEmployee.get(eidStr); // may be undefined if not created, but we created above

        const payloadJSON = JSON.stringify({
          title,
          body,
          url,
          id: String(notifId),             // backward-compatible with your SW
          deliveryId: deliveryId ? String(deliveryId) : undefined, // preferred
        });

        try {
          await webpush.sendNotification(s.subscription, payloadJSON, { TTL: 3600 });
          return true;
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await PushSubscription.deleteOne({ _id: s._id });
          }
          return false;
        }
      })
    );

    const sent = results.filter(r => r.status === 'fulfilled' && r.value === true).length;

    return NextResponse.json({ ok: true, sent, created: employeeIds.length, found: inserted });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Send failed' }, { status: 500 });
  }
}
