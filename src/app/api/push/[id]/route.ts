// app/api/push/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Notification from '@/models/Notification';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  await dbConnect();
  const { id } = params;
  const deleted = await Notification.findByIdAndDelete(id);
  if (!deleted) {
    return NextResponse.json({ ok: false, error: 'Notification not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
