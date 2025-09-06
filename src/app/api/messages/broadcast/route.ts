import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import BroadcastMessage from '@/models/BroadcastMessage';
import Employee from '@/models/Employee';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { subject = '', body = '', urgent = false } = await req.json();
    const s = String(subject).trim();
    const b = String(body).trim();
    if (!s || !b) {
      return NextResponse.json({ success: false, error: 'Subject and body are required' }, { status: 400 });
    }

    // Load recipients
    const employees = await Employee.find({}, { _id: 1 }).lean();
    const recipientIds = employees.map(e => new mongoose.Types.ObjectId(String(e._id)));

    // Create
    await BroadcastMessage.create({
      subject: s,
      body: b,
      urgent: !!urgent,
      createdBy: new mongoose.Types.ObjectId(userId),
      recipients: recipientIds,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (e: any) {
    // Bubble a helpful error back to the client
    return NextResponse.json(
      { success: false, error: e?.message || 'Failed to send' },
      { status: 500 }
    );
  }
}
