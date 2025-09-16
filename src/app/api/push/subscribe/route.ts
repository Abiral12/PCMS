import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PushSubscription from '@/models/PushSubscription';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const { subscription } = await req.json();
    const employeeId = req.headers.get('x-user-id'); // from your buildAuthHeaders()

    if (!employeeId || !subscription?.endpoint) {
      return NextResponse.json({ ok: false, error: 'Missing employee or subscription' }, { status: 400 });
    }

    await PushSubscription.updateOne(
      { 'subscription.endpoint': subscription.endpoint },
      { $set: { employeeId, subscription } },
      { upsert: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Subscribe failed' }, { status: 500 });
  }
}