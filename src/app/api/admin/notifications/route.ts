// /app/api/admin/notifications/route.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Notification from '@/models/Notification';
import Employee from '@/models/Employee';
import jwt from 'jsonwebtoken';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    // Admin auth check
    let token = req.cookies.get('admin_token')?.value;
    if (!token) {
      const auth = req.headers.get('authorization') || '';
      const m = auth.match(/^Bearer\s+(.+)$/i);
      if (m) token = m[1];
    }
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = jwt.decode(token) as any;
    if (!payload || (payload.role && payload.role !== 'Admin')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200);
    const offset = Number(searchParams.get('offset') || 0);

    // Fetch notifications (toEmployeeId is stored as string in model)
    const notifications = await Notification.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .lean();

    // Get total count for pagination
    const total = await Notification.countDocuments({});

    // Format the response
    const formattedNotifications = await Promise.all(notifications.map(async (notif: any) => {
      const empId = String(notif.toEmployeeId || '');
      const emp = empId ? await Employee.findById(empId).select('name email department position').lean() : null;
      return {
      _id: notif._id,
      title: notif.title,
      body: notif.body,
      message: notif.message,
      type: notif.type,
      read: notif.read,
      createdAt: notif.createdAt,
      fromAdminId: notif.fromAdminId,
      toEmployeeId: empId,
      employeeName: (emp as any)?.name || 'Unknown',
      employeeEmail: (emp as any)?.email || '',
      employeeDepartment: (emp as any)?.department || '',
      employeePosition: (emp as any)?.position || '',
    }; }));

    return NextResponse.json({
      success: true,
      notifications: formattedNotifications,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await dbConnect();

    // Admin auth check
    let token = req.cookies.get('admin_token')?.value;
    if (!token) {
      const auth = req.headers.get('authorization') || '';
      const m = auth.match(/^Bearer\s+(.+)$/i);
      if (m) token = m[1];
    }
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = jwt.decode(token) as any;
    if (!payload || (payload.role && payload.role !== 'Admin')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ success: false, error: 'Notification ID required' }, { status: 400 });
    }

    const result = await Notification.findByIdAndDelete(id);
    if (!result) {
      return NextResponse.json({ success: false, error: 'Notification not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete notification' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const token = req.cookies.get('admin_token')?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const payload = jwt.decode(token) as any;
    if (!payload || (payload.role && payload.role !== 'Admin')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { toEmployeeId, title, body, message } = await req.json();
    if (!toEmployeeId || !(typeof toEmployeeId === 'string')) {
      return NextResponse.json({ success: false, error: 'toEmployeeId required' }, { status: 400 });
    }
    if (!body && !message) {
      return NextResponse.json({ success: false, error: 'body or message required' }, { status: 400 });
    }

    try {
      // Make sure we're using the correct schema fields
      const doc = await Notification.create({
        toEmployeeId, // This is the correct field name in the Notification model
        fromAdminId: payload.username || 'admin',
        title: title || undefined,
        body: body || message || '', // Ensure body is always provided as it's required in the schema
        message: message || body,
        type: 'admin_message',
        read: false,
      });
      
      return NextResponse.json({ success: true, notification: doc });
    } catch (error: any) {
      console.error('Error creating notification:', error);
      return NextResponse.json({ 
        success: false, 
        error: error?.message || 'Failed to create notification',
        details: error
      }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Create failed' }, { status: 500 });
  }
}
