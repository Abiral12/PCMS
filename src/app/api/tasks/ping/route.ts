import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Ping from '@/models/Ping'; // we'll create this model

export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const userId = request.headers.get('x-user-id');
    const { timestamp } = await request.json();

    if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    await Ping.create({ employeeId: userId, timestamp: new Date(timestamp) });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
