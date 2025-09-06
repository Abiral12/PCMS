import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import HolidayRequest from '@/models/HolidayRequest';

// ✅ Admin can view all requests
export async function GET() {
  await dbConnect();
  const requests = await HolidayRequest.find().sort({ createdAt: -1 });
  return NextResponse.json({ requests }, { status: 200 });
}

// ✅ Admin can update request status
export async function PUT(request: NextRequest) {
  await dbConnect();
  const { id, status } = await request.json();

  if (!id || !status) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const updated = await HolidayRequest.findByIdAndUpdate(
    id,
    { status },
    { new: true }
  );

  if (!updated) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  return NextResponse.json(updated, { status: 200 });
}
