// lib/actor.ts
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import dbConnect from '@/lib/mongodb';
import Employee from '@/models/Employee';
import Role from '@/models/Role';
import type { Types } from 'mongoose';

// 👇 describe the shape you actually store in Mongo
type EmployeeLean = {
  _id: Types.ObjectId;
  department: string;
  role: string; // if you store role NAME; see variant below if ObjectId
};

type RoleLean = {
  _id: Types.ObjectId;
  name: string;
  department: string;
  permissions: any; // or your concrete Permissions type
};

const ADMIN_COOKIE = 'admin_token';
const JWT_SECRET = process.env.JWT_SECRET as string;

export type Actor =
  | { kind: 'admin'; username?: string }
  | { kind: 'employee'; employeeId: string; department: string; roleName: string; role: RoleLean | null };

export async function getActor(req: NextRequest): Promise<Actor | null> {
  await dbConnect();

  // 1) Admin cookie?
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { username?: string; role?: string };
      return { kind: 'admin', username: payload?.username };
    } catch { /* ignore */ }
  }

  // 2) Employee header (x-user-id)
  const uid = req.headers.get('x-user-id') || '';
  if (uid) {
    // ✅ type the lean result
    const emp = await Employee.findById(uid).lean<EmployeeLean | null>();
    if (!emp) return null;

    // If you store the role NAME on Employee:
    const roleDoc = await Role
      .findOne({ name: emp.role, department: emp.department })
      .lean<RoleLean | null>();

    return {
      kind: 'employee',
      employeeId: String(emp._id),
      department: emp.department,
      roleName: emp.role,
      role: roleDoc,
    };
  }

  return null;
}
