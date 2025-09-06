import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

// ---------------- POST ----------------
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    // ✅ Check cookie for token
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'User not logged in' }, { status: 401 });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();

    if (!body.employeeId) {
      return NextResponse.json(
        { error: 'Missing employeeId field' },
        { status: 400 }
      );
    }

    if (!['checkin', 'checkout'].includes(body.type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be "checkin" or "checkout"' },
        { status: 400 }
      );
    }

    const attendanceRecord = await Attendance.create({
      employeeId: body.employeeId,
      employeeName: body.employeeName || decoded.email || 'Unknown Employee',
      type: body.type,
      timestamp: new Date(),
      imageData: body.imageData || null,
    });

    return NextResponse.json(
      { message: 'Attendance recorded successfully', data: attendanceRecord },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + error.message },
      { status: 500 }
    );
  }
}

// ---------------- GET ----------------
export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    // ✅ Check cookie for token
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'User not logged in' }, { status: 401 });
    }

    try {
      jwt.verify(token, JWT_SECRET);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const records = await Attendance.find({})
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();

    return NextResponse.json({
      message: 'Records retrieved successfully',
      records,
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + error.message },
      { status: 500 }
    );
  }
}
