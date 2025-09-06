import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import LunchLog from '@/models/LunchLog';

export async function POST(req: NextRequest) {
  await dbConnect();
  const { employeeId } = await req.json();

  if (!employeeId) {
    return NextResponse.json({ error: "Missing employeeId" }, { status: 400 });
  }

  const log = await LunchLog.create({ employeeId, type: "lunch-end" });
  return NextResponse.json(log, { status: 201 });
}
