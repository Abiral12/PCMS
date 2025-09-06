import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Notification from '@/models/Notification';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const body = await request.json();
    
    if (!body.toEmployeeId || !body.fromAdminId || !body.message) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const notification = await Notification.create({
      toEmployeeId: body.toEmployeeId,
      fromAdminId: body.fromAdminId,
      message: body.message,
      type: body.type || 'admin_message'
    });

    return NextResponse.json({
      success: true,
      notification
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    
    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: 'Employee ID is required' },
        { status: 400 }
      );
    }

    const notifications = await Notification.find({ 
      toEmployeeId: employeeId 
    }).sort({ createdAt: -1 });

    return NextResponse.json({
      success: true,
      notifications
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}