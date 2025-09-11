// lib/adminAuth.ts
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

export const ADMIN_COOKIE = 'admin_token'; // keep same as your existing constant
const JWT_SECRET = process.env.JWT_SECRET as string;

export function verifyAdminFromCookie(req: NextRequest): { ok: boolean; username?: string } {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) return { ok: false };
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { username?: string; role?: string };
    return { ok: true, username: payload?.username };
  } catch {
    return { ok: false };
  }
}
