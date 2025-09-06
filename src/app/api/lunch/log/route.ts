// app/api/lunch/log/route.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import LunchLog from '@/models/LunchLog';

type LunchType = 'lunch-start' | 'lunch-end';

function parseRange(search: URLSearchParams) {
  const to = search.get('to') ? new Date(search.get('to')!) : new Date();
  const from = search.get('from')
    ? new Date(search.get('from')!)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);

    const employeeId =
      searchParams.get('employeeId') || req.headers.get('x-user-id') || '';
    if (!employeeId) {
      return NextResponse.json({ success: false, error: 'Missing employeeId' }, { status: 400 });
    }

    const { from, to } = parseRange(searchParams);

    const logs = await LunchLog.find({
      employeeId,
      timestamp: { $gte: from, $lte: to },
    })
      .sort({ timestamp: -1 })
      .lean();

    return NextResponse.json({ success: true, logs });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const body = await req.json();
    const employeeId = body.employeeId || req.headers.get('x-user-id');
    const type: LunchType = body.type;
    const imageData = body.imageData ?? body.image ?? null; // accept either key
    const timestamp = body.timestamp ? new Date(body.timestamp) : new Date();

    if (!employeeId || !type) {
      return NextResponse.json(
        { success: false, error: 'employeeId and type are required' },
        { status: 400 }
      );
    }

    const doc = await LunchLog.create({
      employeeId,
      type,
      timestamp,
      imageData,
    });

    return NextResponse.json({ success: true, log: doc });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Server error' }, { status: 500 });
  }
}
