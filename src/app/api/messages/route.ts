import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import dbConnect from '@/lib/mongodb';
import BroadcastMessage from '@/models/BroadcastMessage';
import Employee from '@/models/Employee';

export const runtime = 'nodejs';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_change_me';

// Returns {kind:'admin', username} | {kind:'employee', userId} | null
function identifyCaller(req: NextRequest):
  | { kind: 'admin'; username: string }
  | { kind: 'employee'; userId: string }
  | null {
  // Admin via JWT cookie
  const token = req.cookies.get('admin_token')?.value;
  if (token) {
    try {
      const p = jwt.verify(token, JWT_SECRET) as { role: string; username: string };
      if (p?.role === 'Admin') return { kind: 'admin', username: p.username };
    } catch { /* fall through */ }
  }
  // Legacy employee header (optional)
  const userId = req.headers.get('x-user-id');
  if (userId) return { kind: 'employee', userId };
  return null;
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const caller = identifyCaller(req);
    if (!caller) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // If you want only admins to read messages, uncomment this:
    // if (caller.kind !== 'admin') {
    //   return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    // }

    // (Optional) If employee is calling, make sure they exist:
    if (caller.kind === 'employee') {
      const exists = await Employee.findById(caller.userId).select('_id').lean();
      if (!exists) {
        return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
      }
    }

    const messages = await BroadcastMessage.find({}).sort({ createdAt: -1 }).lean();

    const withMeta = messages.map((m: any) => ({
      _id: String(m._id),
      subject: m.subject,
      body: m.body,
      urgent: !!m.urgent,
      createdAt: m.createdAt,
      createdByName: m.createdByName ?? 'Admin',
      recipientCount: Array.isArray(m.recipients) ? m.recipients.length : undefined,
    }));

    return NextResponse.json({ success: true, messages: withMeta }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: 'Failed to load messages', details: e?.message },
      { status: 500 }
    );
  }
}
