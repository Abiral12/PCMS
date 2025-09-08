// app/api/messages/broadcast/route.ts
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import BroadcastMessage from '@/models/BroadcastMessage';
import Employee from '@/models/Employee';
import { getAdminFromCookies } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    // 1) Admin auth from cookie
    const admin = getAdminFromCookies(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 2) Input
    const { subject = '', body = '', urgent = false } = await req.json();
    const s = String(subject).trim();
    const b = String(body).trim();
    if (!s || !b) {
      return NextResponse.json({ success: false, error: 'Subject and body are required' }, { status: 400 });
    }

    // 3) Recipients
    const employees = await Employee.find({}, { _id: 1 }).lean();
    const recipientIds = employees.map(e => new mongoose.Types.ObjectId(String(e._id)));

    // 4) Save
    const createdBy =
  admin.id && mongoose.isValidObjectId(admin.id)
    ? new mongoose.Types.ObjectId(admin.id)
    : undefined;

await BroadcastMessage.create({
  subject: s,
  body: b,
  urgent: !!urgent,
  ...(createdBy ? { createdBy } : {}),
  createdByName: admin.username || 'Admin',
  recipients: recipientIds,
  recipientCount: recipientIds.length,
});

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Failed to send' }, { status: 500 });
  }
}
