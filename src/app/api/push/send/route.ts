// /app/api/push/send/route.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PushSubscription from '@/models/PushSubscription';
import Notification from '@/models/Notification';
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

    // --- Optional auth
    let token = req.cookies.get('admin_token')?.value;
    if (!token) {
      const auth = req.headers.get('authorization') || '';
      const m = auth.match(/^Bearer\s+(.+)$/i);
      if (m) token = m[1];
    }
    // Optional: allow x-admin-token (e.g., for Postman) matching env ADMIN_TOKEN or 'dev' in non-prod
    const headerOverride = req.headers.get('x-admin-token');
    const isDevBypass = headerOverride && (headerOverride === process.env.ADMIN_TOKEN || (process.env.NODE_ENV !== 'production' && headerOverride === 'dev'));

    if (!token && !isDevBypass) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const payload = isDevBypass ? { role: 'Admin', username: 'Dev' } : (jwt.decode(token as string) as any);
    if (!payload || (payload.role && payload.role !== 'Admin')) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const { employeeIds, title, body, url } = await req.json();
    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return NextResponse.json({ ok: false, error: 'No recipients' }, { status: 400 });
    }
    if (!title || !body) {
      return NextResponse.json({ ok: false, error: 'Title and body required' }, { status: 400 });
    }

    // subscriptions for selected employees (may be none)
    const validObjectIds = employeeIds
      .map((id: string) => {
        try { return new Types.ObjectId(id); } catch { return null as any; }
      })
      .filter(Boolean);

    const subs = validObjectIds.length
      ? await PushSubscription.find({ employeeId: { $in: validObjectIds } }).lean()
      : [];

    // Instead of creating new notifications, find existing ones created by ClientDashboard.tsx
    // Map employeeId -> notification _id
    const employeeToNotifId = new Map<string, Types.ObjectId>();
    
    // Find recently created notifications for these employees with matching title/body
    // Using a 30-second window to match notifications created by the client
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
    const existingNotifications = await Notification.find({
      toEmployeeId: { $in: employeeIds },
      title,
      body,
      createdAt: { $gte: thirtySecondsAgo }
    }).lean();
    
    // Map each employee to their notification
    existingNotifications.forEach((notif: any) => {
      employeeToNotifId.set(String(notif.toEmployeeId), notif._id);
    });
    
    // For any employees without a notification, create a fallback ID (shouldn't happen)
    employeeIds.forEach((eid: string) => {
      if (!employeeToNotifId.has(String(eid))) {
        employeeToNotifId.set(String(eid), new Types.ObjectId());
      }
    });
    
    const inserted = existingNotifications.length;

    // Now send a push per subscription with the per-user notification id from existing notifications
    const results = await Promise.allSettled(
      subs.map(async (s: any) => {
        const notifId = employeeToNotifId.get(String(s.employeeId)) || new Types.ObjectId();
        const payloadJSON = JSON.stringify({ title, body, url, id: String(notifId) });
        try {
          await webpush.sendNotification(s.subscription, payloadJSON, { TTL: 3600 });
          return true;
        } catch (err: any) {
          // cleanup expired endpoints
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await PushSubscription.deleteOne({ _id: s._id });
          }
          return false;
        }
      })
    );

    const sent = results.filter(r => r.status === 'fulfilled' && r.value === true).length;

    return NextResponse.json({ ok: true, sent, found: inserted });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Send failed' }, { status: 500 });
  }
}
