// lib/actor.ts
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import dbConnect from '@/lib/mongodb';
import Employee from '@/models/Employee';
import Role from '@/models/Role';

const ADMIN_COOKIE = 'admin_token';
const JWT_SECRET = process.env.JWT_SECRET as string;

export type Actor =
  | { kind: 'admin'; username?: string }
  | { kind: 'employee'; employeeId: string; department: string; roleName: string; role: any | null };

export async function getActor(req: NextRequest): Promise<Actor | null> {
  await dbConnect();

  // 1) Admin cookie?
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { username?: string; role?: string };
      // If you store role in the admin JWT, you can check here; for now any admin is superuser:
      return { kind: 'admin', username: payload?.username };
    } catch {
      /* fallthrough */
    }
  }

  // 2) Employee header (x-user-id)
  const uid = req.headers.get('x-user-id') || '';
  if (uid) {
    const emp = await Employee.findById(uid).lean();
    if (!emp) return null;

    // emp.role is a role "name" in your current schema. Fetch its full doc:
    const roleDoc = await Role.findOne({ name: emp.role, department: emp.department }).lean();

    return {
      kind: 'employee',
      employeeId: String(emp._id),
      department: emp.department,
      roleName: emp.role,
      role: roleDoc
    };
  }

  return null;
}
