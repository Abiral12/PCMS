import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Rule from '@/models/Rule';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_change_me';

function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('admin_token')?.value;
  if (!token) return { ok: false as const, error: 'Unauthorized' };
  try {
    const p = jwt.verify(token, JWT_SECRET) as { role?: string };
    if (p.role !== 'Admin') return { ok: false as const, error: 'Forbidden' };
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: 'Invalid token' };
  }
}

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  try {
    await dbConnect();
    const rules = await Rule.find({}).sort({ order: 1, createdAt: -1 }).lean();
    return NextResponse.json({ success: true, rules });
  } catch (e: any) {
    console.error('GET /api/admin/rules error', e);
    return NextResponse.json({ success: false, error: 'Failed to load rules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  try {
    await dbConnect();
    const body = await request.json();
    const r = await Rule.create({ title: body.title || 'Untitled', body: body.body || '', order: body.order || 0 });
    return NextResponse.json({ success: true, rule: r });
  } catch (e: any) {
    console.error('POST /api/admin/rules error', e);
    return NextResponse.json({ success: false, error: 'Failed to create rule' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  try {
    await dbConnect();
    const body = await request.json();
    if (!body.id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });
    const update: any = {};
    if (typeof body.title !== 'undefined') update.title = body.title;
    if (typeof body.body !== 'undefined') update.body = body.body;
    if (typeof body.order !== 'undefined') update.order = body.order;
    const r = await Rule.findByIdAndUpdate(body.id, update, { new: true }).lean();
    return NextResponse.json({ success: true, rule: r });
  } catch (e: any) {
    console.error('PUT /api/admin/rules error', e);
    return NextResponse.json({ success: false, error: 'Failed to update rule' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });
    await Rule.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('DELETE /api/admin/rules error', e);
    return NextResponse.json({ success: false, error: 'Failed to delete rule' }, { status: 500 });
  }
}
