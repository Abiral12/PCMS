import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import HolidayRequest from '@/models/HolidayRequest';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const { employeeId, employeeName, date, message } = await request.json();

    if (!employeeId || !employeeName || !date || !message) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const req = await HolidayRequest.create({
      employeeId,
      employeeName,
      date,
      message,
      status: 'pending',
    });

    return NextResponse.json(req, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');

    const query = employeeId ? { employeeId } : {};
    const requests = await HolidayRequest.find(query).sort({ createdAt: -1 });

    return NextResponse.json({ requests }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
