import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

export type JwtUser = {
  id: string;
  email: string;
  role?: string;
  permissions?: Record<string, boolean>;
};

export function getUserFromAuthHeader(req: Request): JwtUser | null {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as JwtUser;
  } catch { return null; }
}

export function requirePerm(user: JwtUser | null, perm: string) {
  if (!user) return false;
  if (user.role === 'Admin') return true; // admins do everything
  return !!user.permissions?.[perm];
}
