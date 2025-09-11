// app/api/admin/settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AdminUser from '@/models/AdminUser';
import bcrypt from 'bcryptjs';
import { verifyAdminFromCookie } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = verifyAdminFromCookie(req);
  if (!auth.ok) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  await dbConnect();

  // You may support multiple admins in future; for now, return the first
  const admin = await AdminUser.findOne({}, { username: 1 }).lean();
  if (!admin) return NextResponse.json({ success: false, error: 'Admin not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: { username: admin.username } });
}

export async function PUT(req: NextRequest) {
  const auth = verifyAdminFromCookie(req);
  if (!auth.ok) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { username, currentPassword, newPassword } = await req.json();
  await dbConnect();

  const admin = await AdminUser.findOne({});
  if (!admin) return NextResponse.json({ success: false, error: 'Admin not found' }, { status: 404 });

  // If changing password, verify currentPassword first
  if (newPassword) {
    if (!currentPassword) {
      return NextResponse.json({ success: false, error: 'Current password required' }, { status: 400 });
    }
    const ok = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!ok) {
      return NextResponse.json({ success: false, error: 'Current password incorrect' }, { status: 403 });
    }
    admin.passwordHash = await bcrypt.hash(newPassword, 12);
  }

  if (username && username !== admin.username) {
    admin.username = String(username).trim();
  }

  await admin.save();
  return NextResponse.json({ success: true, message: 'Settings updated' });
}
