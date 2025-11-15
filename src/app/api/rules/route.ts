import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Rule from '@/models/Rule';

export async function GET() {
  try {
    await dbConnect();
    const rules = await Rule.find({}).sort({ order: 1, createdAt: -1 }).lean();
    return NextResponse.json({ success: true, rules });
  } catch (err: any) {
    console.error('GET /api/rules error', err);
    return NextResponse.json({ success: false, error: 'Failed to load rules' }, { status: 500 });
  }
}
