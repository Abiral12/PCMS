// /app/api/push/recent/route.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Notification from '@/models/Notification';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  await dbConnect();
  const userId = req.headers.get('x-user-id')?.trim()
             || new URL(req.url).searchParams.get('employeeId')?.trim()
             || '';

  const filter = userId ? { toEmployeeId: userId } : {};
  const list = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const shaped = list.map(n => {
    const [first, ...rest] = String(n.message || '').split('\n');
    return {
      ...n,
      title: first || 'Notification',
      body: rest.join('\n') || '',
    };
  });

  return NextResponse.json({ ok: true, notifications: shaped });
}

