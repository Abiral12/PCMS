// app/api/push/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Notification from '@/models/Notification';

// Helper: during build, params may be a Promise
function isPromise<T>(x: unknown): x is Promise<T> {
  return !!x && typeof (x as Promise<T>).then === 'function';
}

type Params = { id: string };
type Ctx = { params: Params } | { params: Promise<Params> };

export async function DELETE(req: NextRequest, context: Ctx) {
  await dbConnect();
  
  const { id } = isPromise<Params>(context.params)
    ? await context.params
    : context.params;
  const deleted = await Notification.findByIdAndDelete(id);
  if (!deleted) {
    return NextResponse.json({ ok: false, error: 'Notification not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
