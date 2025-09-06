import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Holiday from '@/models/Holiday';

export async function GET() {
  await dbConnect();
  const holidays = await Holiday.find({});
  return NextResponse.json({ holidays });
}

export async function POST(req: Request) {
  try {
    await dbConnect();
    const { date, description } = await req.json();

    const holiday = new Holiday({ date, description });
    await holiday.save();

    return NextResponse.json({ holiday });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}


