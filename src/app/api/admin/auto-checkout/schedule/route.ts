import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';

export const runtime = 'nodejs';
const q = new Client({ token: process.env.QSTASH_TOKEN! });

export async function POST(req: NextRequest) {
  const hdr = req.headers.get('x-admin-token');
  if (!process.env.ADMIN_TOKEN || hdr !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const destination = new URL('/api/sweeps/auto-checkout-8pm', process.env.APP_URL!).toString();

  // Run daily at 20:00 Nepal time
  const cron = `CRON_TZ=Asia/Kathmandu 0 20 * * *`;

  try {
    const created = await q.schedules.create({
      destination,
      cron,
      scheduleId: 'auto-checkout-8pm-v1', // stable ID so re-POST won’t duplicate
      body: JSON.stringify({}),
      headers: {
        // Forward your admin token so the sweep route accepts the call
        'Upstash-Forward-x-admin-token': process.env.ADMIN_TOKEN!,
        'Content-Type': 'application/json',
      },
    });

    return NextResponse.json({ ok: true, scheduleId: created.scheduleId || 'auto-checkout-8pm-v1' });
  } catch (e: any) {
    // If it already exists, you can ignore
    return NextResponse.json({ ok: false, error: e?.message || 'Create failed' }, { status: 500 });
  }
}
