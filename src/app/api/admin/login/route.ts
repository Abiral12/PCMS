// app/api/admin/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AdminUser from '@/models/AdminUser';
import bcrypt from 'bcryptjs';
import { signAdminToken } from '@/lib/auth';
import { ADMIN_COOKIE } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  await dbConnect();

  // 1) Seed if empty collection and env creds exist
  const existingCount = await AdminUser.countDocuments({});
  if (existingCount === 0 && process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await AdminUser.create({
      username: process.env.ADMIN_USERNAME,
      passwordHash: hash,
      roles: ['Admin'],
    });
  }

  // 2) Lookup by username
  const admin = await AdminUser.findOne({ username });
  if (!admin) {
    return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
  }

  // 3) Verify password
  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) {
    return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
  }

  // 4) Issue cookie
  const token = signAdminToken({ username: admin.username, role: 'Admin' });
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
