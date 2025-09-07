// app/api/tasks/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import dbConnect from '@/lib/mongodb';
import Task from '@/models/Task';
import Employee from '@/models/Employee';
import Role from '@/models/Role';

// Explicit type for params
interface Params {
  id: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_change_me';

type Perms = {
  canAssignTasks?: boolean;
  canCheckIn?: boolean;
  canManageEmployees?: boolean;
  canManageDepartments?: boolean;
  canManageRoles?: boolean;
  canViewAllTasks?: boolean;
  canViewTasks?: boolean;
  canViewReports?: boolean;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}
function hasObjId(x: unknown): x is { _id: { toString(): string } } {
  return typeof x === 'object' && x !== null && '_id' in x;
}

function identifyCaller(req: NextRequest):
  | { kind: 'admin'; username: string }
  | { kind: 'employee'; userId: string }
  | null {
  // Admin via JWT cookie
  const adminToken = req.cookies.get('admin_token')?.value;
  if (adminToken) {
    try {
      const payload = jwt.verify(adminToken, JWT_SECRET) as { role: string; username: string };
      if (payload?.role === 'Admin') return { kind: 'admin', username: payload.username };
    } catch { /* ignore */ }
  }
  // Employee via header or cookie
  const fromHeader = req.headers.get('x-user-id');
  if (fromHeader) return { kind: 'employee', userId: fromHeader };
  const fromCookie = req.cookies.get('employeeId')?.value ?? null;
  if (fromCookie) return { kind: 'employee', userId: fromCookie };
  return null;
}

async function getUserRole(userId: string) {
  const employee = await Employee.findById(userId).populate('role').lean();
  const roleValue = isRecord(employee) ? (employee as Record<string, unknown>)['role'] : null;

  if (roleValue && isRecord(roleValue) && hasObjId(roleValue)) {
    return {
      _id: roleValue._id,
      permissions: (roleValue as Record<string, unknown>)['permissions'] as Perms | undefined,
    };
  }
  if (typeof roleValue === 'string') {
    const roleDoc = await Role.findOne({ name: roleValue }).lean();
    if (roleDoc) {
      return {
        _id: (roleDoc as any)._id,
        permissions: (roleDoc as any).permissions as Perms | undefined,
      };
    }
  }
  return null;
}

function parseDateMaybe(value: unknown): Date | undefined {
  if (value == null) return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/* ---------------- PUT /api/tasks/[id] ---------------- */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  try {
    const { id } = await context.params;           // 👈 await the params
    const body = await request.json();

    await dbConnect();

    const updated = await Task.findByIdAndUpdate(
      id,
      {
        title: body.title,
        description: body.description,
        assignedTo: body.assignedTo,
        priority: body.priority,
        status: body.status,
        dueDate: body.dueDate,
      },
      { new: true }
    );

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, task: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update task' },
      { status: 500 }
    );
  }
}

// DELETE /api/tasks/[id]
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<Params> }
) {
  try {
    const { id } = await context.params;           // 👈 await the params
    await dbConnect();

    const deleted = await Task.findByIdAndDelete(id);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: 'Task deleted' });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete task' },
      { status: 500 }
    );
  }
}
