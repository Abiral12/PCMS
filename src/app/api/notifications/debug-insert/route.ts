import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Notification from '@/models/Notification';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const json = await req.json().catch(() => ({}));
    const {
      toEmployeeId = 'TEST_EMP',
      fromAdminId = 'DEBUG_ADMIN',
      message = 'Hello from debug',
      type = 'admin_message',
    } = json || {};

    const doc = await Notification.create({
      toEmployeeId,
      fromAdminId,
      message,
      type,
      read: false,
    });

    const dbInfo = {
      dbName: mongoose.connection?.name,
      host: (mongoose.connection as any)?.host,
      collection: (Notification as any).collection?.name,
      readyState: mongoose.connection?.readyState, // 1 = connected
    };

    return NextResponse.json({
      ok: true,
      insertedId: String(doc._id),
      dbInfo,
      insertedDoc: {
        toEmployeeId: doc.toEmployeeId,
        fromAdminId: doc.fromAdminId,
        message: doc.message,
        type: doc.type,
        createdAt: doc.createdAt,
        read: doc.read,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Debug insert failed' }, { status: 500 });
  }
}
