// lib/auth.ts
import jwt from 'jsonwebtoken';
import type { NextRequest } from 'next/server';

export type JwtUser = {
  id: string;
  email: string;
  role?: string;
  permissions?: Record<string, boolean>;
};

// If JWT_SECRET is missing, crash early (better than “invalid signature” later)
const RAW_SECRET = process.env.JWT_SECRET;
if (!RAW_SECRET) {
  throw new Error('JWT_SECRET is not set. Add it to your .env and restart the dev server.');
}
export const JWT_SECRET: string = RAW_SECRET;

// --- Bearer helpers (Authorization header) ---
export function getBearerToken(req: Request): string | null {
  const auth = req.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

export function getUserFromAuthHeader(req: Request): JwtUser | null {
  const token = getBearerToken(req);
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as JwtUser;
  } catch {
    return null;
  }
}

export function requirePerm(user: JwtUser | null, perm: string): boolean {
  if (!user) return false;
  if (user.role === 'Admin') return true; // admins can do everything
  return !!user.permissions?.[perm];
}

// --- Admin cookie helpers (admin_token) ---
export type AdminClaims = {
  id?: string;         // include this when issuing if you want createdBy
  username?: string;   // optional display name
  role: 'Admin';
  iat: number;
  exp: number;
};

export const ADMIN_COOKIE = 'admin_token';

export function getAdminFromCookies(req: NextRequest): AdminClaims | null {
  const t = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!t) return null;
  try {
    const claims = jwt.verify(t, JWT_SECRET) as AdminClaims;
    return claims.role === 'Admin' ? claims : null;
  } catch {
    return null;
  }
}

// Optional convenience to sign admin tokens (use in admin login)
export function signAdminToken(payload: Omit<AdminClaims, 'iat' | 'exp' | 'role'> & { role?: 'Admin' }) {
  return jwt.sign({ ...payload, role: 'Admin' as const }, JWT_SECRET, { expiresIn: '1d' });
}
