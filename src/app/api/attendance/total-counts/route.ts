import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import jwt from 'jsonwebtoken';


const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    // Check authentication
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

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    
    if (!employeeId) {
      return NextResponse.json({ error: 'Missing employeeId parameter' }, { status: 400 });
    }

    // Query all attendance records for this employee
    const query = {
      employeeId: employeeId
    };

    // Get counts for checkins and checkouts
    const [checkinCount, checkoutCount] = await Promise.all([
      Attendance.countDocuments({ ...query, type: 'checkin' }),
      Attendance.countDocuments({ ...query, type: 'checkout' })
    ]);

    return NextResponse.json({
      success: true,
      totalCounts: {
        checkins: checkinCount,
        checkouts: checkoutCount
      }
    });

  } catch (error: any) {
    console.error('GET /api/attendance/total-counts - Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}
