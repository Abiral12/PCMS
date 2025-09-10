// app/api/messages/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import BroadcastMessage from '@/models/BroadcastMessage';
import jwt from 'jsonwebtoken';

export const runtime = 'nodejs';

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // <- params is a Promise here
) {
  try {
    await dbConnect();

    // Require admin cookie
    const token = req.cookies.get('admin_token')?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const JWT_SECRET = process.env.JWT_SECRET as string;
    const payload = jwt.verify(token, JWT_SECRET) as { role?: string };
    if (payload?.role !== 'Admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Await params
    const { id } = await context.params;

    // Delete the message
    const result = await BroadcastMessage.deleteOne({ _id: id });
    if (!result.deletedCount) {
      return NextResponse.json({ success: false, error: 'Message not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    const msg = e?.message || 'Failed to delete';
    const status = /Cast to ObjectId/.test(msg) ? 400 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
