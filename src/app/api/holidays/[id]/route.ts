// src/app/api/holidays/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Holiday from '@/models/Holiday';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> } // 👈 Next 15 expects Promise here
): Promise<Response> {
  const { id } = await context.params; // 👈 unwrap the promised params

  try {
    await dbConnect();
    await Holiday.findByIdAndDelete(id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
