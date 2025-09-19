import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import { Types } from 'mongoose';

export const runtime = 'nodejs';

// Build all variants of the id we may encounter
function asIdVariants(id: string) {
  const str = String(id);
  let obj: Types.ObjectId | null = null;
  try { obj = new Types.ObjectId(str); } catch {}
  return { str, obj, hasObj: !!obj };
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    // admin auth (cookie or x-admin-token)
    const headerToken = req.headers.get('x-admin-token');
    const cookieToken = req.cookies.get('admin_token')?.value;
    const headerOk   = !!process.env.ADMIN_TOKEN && headerToken === process.env.ADMIN_TOKEN;
    if (!headerOk && !cookieToken) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { employeeId, at, reason } = await req.json();
    if (!employeeId) {
      return NextResponse.json({ ok: false, error: 'employeeId required' }, { status: 400 });
    }

    const { str, obj, hasObj } = asIdVariants(employeeId);

    // Be tolerant to how the id is stored: string, ObjectId, nested field names
    const or: any[] = [];
    if (hasObj) {
      or.push(
        { employeeId: obj },
        { employee: obj },
        { 'employee._id': obj },
      );
    }
    or.push(
      { employeeId: str },
      { employee: str },
      { 'employee._id': str },
    );

    // Find the last attendance row for this employee (no date restriction)
    // Sort by many possible time fields so we still get the latest row
    const last = await Attendance.findOne({ $or: or })
      .sort({ timestamp: -1, createdAt: -1, time: -1, date: -1, _id: -1 })
      .lean<{ type?: 'checkin' | 'checkout'; timestamp?: Date } | null>();

    if (!last) {
      // If you still see this, the id field name in your schema is something else—tell me its exact shape.
      return NextResponse.json(
        { ok: false, error: 'No attendance yet (no checkin to close)' },
        { status: 409 }
      );
    }

    // If the last record is already a checkout, make the operation idempotent
    if (last.type && String(last.type).toLowerCase() === 'checkout') {
      return NextResponse.json({ ok: true, created: false, reason: 'already checked out' });
    }

    const when = at ? new Date(at) : new Date();
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ ok: false, error: 'Invalid timestamp' }, { status: 400 });
    }

    // Write the checkout using whichever representation you store
    const payload: any = {
      employeeId: hasObj ? obj! : str,
      type: 'checkout',
      timestamp: when,
      reason: reason || 'admin-force',
      createdAt: new Date(),
    };

    const doc = await Attendance.create(payload);

    return NextResponse.json({
      ok: true,
      created: true,
      record: { _id: doc._id, timestamp: doc.timestamp ?? when },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Force checkout failed' }, { status: 500 });
  }
}
