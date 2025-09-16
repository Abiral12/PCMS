import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Notification from '@/models/Notification';
import type { UpdateResult } from 'mongodb';

function isPromise<T>(x: unknown): x is Promise<T> {
  return !!x && typeof (x as Promise<T>).then === 'function';
}

type Params = { id: string };
type Ctx = { params: Params } | { params: Promise<Params> };

export const runtime = 'nodejs';
// Optional, avoids edge caching weirdness for API routes
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, context: Ctx) {
  try {
    await dbConnect();

    const { id } = isPromise<Params>(context.params)
      ? await context.params
      : context.params;

    const _id = (id || '').trim();
    if (!_id) {
      return NextResponse.json({ ok: false, error: 'No id' }, { status: 400 });
    }

    // Cast so TS knows we’re on the modern driver shape
    const res = (await Notification.updateOne(
      { _id },
      { $set: { read: true } }
    )) as UpdateResult;

    if (!res.acknowledged) {
      return NextResponse.json({ ok: false, error: 'Write not acknowledged' }, { status: 500 });
    }
    if (res.matchedCount === 0) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, modified: res.modifiedCount });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Ack failed' }, { status: 500 });
  }
}
