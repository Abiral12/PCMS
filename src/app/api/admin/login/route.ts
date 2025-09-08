// app/api/admin/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { signAdminToken, ADMIN_COOKIE } from '@/lib/auth';

const ADMIN_USER = process.env.ADMIN_USERNAME!;
const ADMIN_PASS = process.env.ADMIN_PASSWORD!;

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
  }

  const token = signAdminToken({ username }); // include { id } too if you want
  const res = NextResponse.json({ success: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24,
  });
  return res;
}
