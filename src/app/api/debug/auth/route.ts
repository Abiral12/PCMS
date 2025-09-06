// app/api/debug/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
export const runtime = 'nodejs';
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_change_me';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('admin_token')?.value || null;
  let verified: any = null;
  try { if (token) verified = jwt.verify(token, JWT_SECRET); } catch {}
  return NextResponse.json({ hasCookie: !!token, verified });
}
