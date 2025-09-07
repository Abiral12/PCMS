// app/api/tasks/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import dbConnect from '@/lib/mongodb';
import Task from '@/models/Task';
import Employee from '@/models/Employee';
import Role from '@/models/Role';

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
  const adminToken = req.cookies.get('admin_token')?.value;
  if (adminToken) {
    try {
      const payload = jwt.verify(adminToken, JWT_SECRET) as { role: string; username: string };
      if (payload?.role === 'Admin') return { kind: 'admin', username: payload.username };
    } catch { /* ignore */ }
  }
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
  req: NextRequest,
  context: { params: Promise<{ id: string }> }   // ← params is a Promise
) {
  try {
    await dbConnect();

    const caller = identifyCaller(req);
    if (!caller) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { id } = await context.params;          // ← await it
    const task = await Task.findById(id);
    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });

    // Authorization
    let isAdmin = caller.kind === 'admin';
    let isManager = false;
    let isAssignee = false;

    if (caller.kind === 'employee') {
      const roleDoc = await getUserRole(caller.userId);
      isManager = !!roleDoc?.permissions?.canAssignTasks;
      isAssignee = task.assignedTo?.toString?.() === caller.userId;
    }

    if (!isAdmin && !isManager && !isAssignee) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const raw = await req.json();
    const body = isRecord(raw) ? (raw as Record<string, unknown>) : {};

    const updates: Record<string, unknown> = {};

    if (isAdmin || isManager) {
      if (typeof body.title === 'string') updates.title = body.title.trim();
      if (typeof body.description === 'string') updates.description = body.description;
      if (body.priority === 'low' || body.priority === 'medium' || body.priority === 'high') {
        updates.priority = body.priority;
      }
      if (
        body.status === 'pending' ||
        body.status === 'in-progress' ||
        body.status === 'completed' ||
        body.status === 'cancelled'
      ) {
        updates.status = body.status;
      }
      const due = parseDateMaybe(body.dueDate);
      if (due) updates.dueDate = due;

      if (typeof body.assignedTo === 'string' && body.assignedTo !== task.assignedTo?.toString()) {
        updates.assignedTo = body.assignedTo;

        // recalc role field to the assignee's role _id
        const emp = await Employee.findById(body.assignedTo).populate('role').lean();
        let roleId: string | null = null;
        const empRole = emp && isRecord(emp) ? (emp as any).role : null;
        if (empRole && isRecord(empRole) && hasObjId(empRole)) {
          roleId = empRole._id.toString();
        } else if (typeof empRole === 'string') {
          const r = await Role.findOne({ name: empRole }).lean();
          roleId = r ? ((r as any)._id).toString() : null;
        }
        updates.role = roleId;
      }
    } else if (isAssignee) {
      if (typeof body.description === 'string') updates.description = body.description;
      if (
        body.status === 'pending' ||
        body.status === 'in-progress' ||
        body.status === 'completed' ||
        body.status === 'cancelled'
      ) {
        updates.status = body.status;
      }
    }

    Object.assign(task, updates);
    await task.save();

    return NextResponse.json({ success: true, task });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error('PUT /api/tasks/[id] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/* -------------- DELETE /api/tasks/[id] -------------- */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }   // ← params is a Promise
) {
  try {
    await dbConnect();

    const caller = identifyCaller(req);
    if (!caller) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { id } = await context.params;          // ← await it
    const task = await Task.findById(id).lean();
    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });

    let allowed = caller.kind === 'admin';

    if (!allowed && caller.kind === 'employee') {
      const roleDoc = await getUserRole(caller.userId);
      if (roleDoc?.permissions?.canAssignTasks) allowed = true;

      const toStr = (v: any) => (typeof v === 'string' ? v : v?.toString?.());
      if (!allowed && toStr((task as any).assignedTo) === caller.userId) allowed = true;
      if (!allowed && typeof (task as any).assignedBy === 'string' && (task as any).assignedBy === caller.userId) {
        allowed = true;
      }
    }

    if (!allowed) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });

    await Task.findByIdAndDelete(id);
    return NextResponse.json({ success: true, message: 'Task deleted' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error('DELETE /api/tasks/[id] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
