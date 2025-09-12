import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PushSubscription from '@/models/PushSubscription';
import webpush from 'web-push';
import jwt from 'jsonwebtoken';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    // OPTIONAL: check admin cookie/role
    const token = req.cookies.get('admin_token')?.value;
    if (!token) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const payload = jwt.decode(token) as any;
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

    const subs = await PushSubscription.find({ employeeId: { $in: employeeIds } }).lean();
    if (!subs.length) return NextResponse.json({ ok: true, sent: 0 });

    const payloadJSON = JSON.stringify({ title, body, url });

    const results = await Promise.allSettled(
      subs.map(async (s: any) => {
        try {
          await webpush.sendNotification(s.subscription, payloadJSON, { TTL: 3600 });
          return true;
        } catch (err: any) {
          // Clean up gone endpoints
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await PushSubscription.deleteOne({ _id: s._id });
          }
          return false;
        }
      })
    );

    const sent = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
    return NextResponse.json({ ok: true, sent });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Send failed' }, { status: 500 });
  }
}
