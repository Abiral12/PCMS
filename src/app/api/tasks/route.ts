// app/api/tasks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import dbConnect from '@/lib/mongodb';
import Task from '@/models/Task';
import Employee from '@/models/Employee';
import Role from '@/models/Role';

export const runtime = 'nodejs';

// ---- Auth / Perms ---------------------------------------------------
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

type RoleLean = {
  _id?: { toString(): string } | string;
  name?: string;
  permissions?: Perms;
} | null;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}
function hasObjId(x: unknown): x is { _id: { toString(): string } } {
  return typeof x === 'object' && x !== null && '_id' in x;
}

/** Identify caller:
 *  - { kind: 'admin', username }
 *  - { kind: 'employee', userId }
 *  - null
 */
function identifyCaller(req: NextRequest):
  | { kind: 'admin'; username: string }
  | { kind: 'employee'; userId: string }
  | null {
  // Admin via JWT cookie
  const adminToken = req.cookies.get('admin_token')?.value;
  if (adminToken) {
    try {
      const payload = jwt.verify(adminToken, JWT_SECRET) as { role: string; username: string };
      if (payload?.role === 'Admin') {
        return { kind: 'admin', username: payload.username };
      }
    } catch {
      /* fall through */
    }
  }

  // Employee via header or cookie
  const fromHeader = req.headers.get('x-user-id');
  if (fromHeader) return { kind: 'employee', userId: fromHeader };

  const fromCookie = req.cookies.get('employeeId')?.value ?? null;
  if (fromCookie) return { kind: 'employee', userId: fromCookie };

  return null;
}

async function getUserRole(userId: string): Promise<RoleLean> {
  const employee = await Employee.findById(userId).populate('role').lean();

  const roleValue = isRecord(employee) ? (employee as Record<string, unknown>)['role'] : null;

  if (roleValue && isRecord(roleValue) && hasObjId(roleValue)) {
    const { _id } = roleValue;
    return {
      _id,
      permissions: (roleValue as Record<string, unknown>)['permissions'] as Perms | undefined,
    };
  }

  if (typeof roleValue === 'string') {
    const roleDoc = await Role.findOne({ name: roleValue }).lean();
    if (roleDoc) {
      return {
        _id: (roleDoc as Record<string, unknown>)['_id'] as { toString(): string },
        permissions: (roleDoc as Record<string, unknown>)['permissions'] as Perms | undefined,
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

// ------------------------ TASKS API ------------------------

// GET /api/tasks
export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const caller = identifyCaller(request);
    if (!caller) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const assignedToParam = searchParams.get('assignedTo') || undefined;

    if (caller.kind === 'admin') {
      const query: Record<string, unknown> = {};
      if (assignedToParam) query.assignedTo = assignedToParam;

      const tasks = await Task.find(query).sort({ dueDate: 1, priority: -1 }).lean();
      return NextResponse.json({ success: true, tasks });
    }

    // Employee path (permissions)
    const userId = caller.userId;
    const roleDoc = await getUserRole(userId);
    if (!roleDoc) {
      return NextResponse.json({ success: false, error: 'No role assigned' }, { status: 403 });
    }

    const canViewAll = !!roleDoc.permissions?.canViewAllTasks;
    const canViewSome = !!roleDoc.permissions?.canViewTasks;

    let query: Record<string, unknown> = {};

    if (canViewAll) {
      if (assignedToParam) query.assignedTo = assignedToParam;
    } else if (canViewSome) {
      const orConditions: Array<Record<string, unknown>> = [{ assignedTo: userId }];

      if (roleDoc._id) {
        const roleIdStr = typeof roleDoc._id === 'string' ? roleDoc._id : roleDoc._id.toString();
        orConditions.push({ role: roleIdStr });
      }

      query = assignedToParam
        ? { $and: [{ $or: orConditions }, { assignedTo: assignedToParam }] }
        : { $or: orConditions };
    } else {
      query = { assignedTo: userId };
    }

    const tasks = await Task.find(query).sort({ dueDate: 1, priority: -1 }).lean();
    return NextResponse.json({ success: true, tasks });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error';
    console.error('Error in GET /api/tasks:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/tasks
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const caller = identifyCaller(request);
    if (!caller) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins or users with canAssignTasks may create
    if (caller.kind !== 'admin') {
      const roleDoc = await getUserRole(caller.userId);
      if (!roleDoc?.permissions?.canAssignTasks) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    const raw = await request.json();
    const body = isRecord(raw) ? (raw as Record<string, unknown>) : {};

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const assignedTo = typeof body.assignedTo === 'string' ? body.assignedTo : '';
    const dueDate = parseDateMaybe(body.dueDate);
    const description = typeof body.description === 'string' ? body.description : '';
    const priority =
      body.priority === 'low' || body.priority === 'high' || body.priority === 'medium'
        ? body.priority
        : 'medium';
    const status =
      body.status === 'pending' || body.status === 'in-progress' || body.status === 'completed' || body.status === 'cancelled'
        ? body.status
        : 'pending';

    // assignedBy comes from the caller, not the client body
    const assignedBy =
      caller.kind === 'admin'
        ? (caller.username || 'Admin')
        : caller.userId;

    if (!title || !assignedTo || !dueDate) {
      return NextResponse.json(
        { success: false, error: 'Title, assignedTo, and valid dueDate are required' },
        { status: 400 }
      );
    }

    // Resolve assignee role to Role _id (string)
    const assignedEmployee = await Employee.findById(assignedTo).populate('role').lean();
    let roleId: string | null = null;

    if (assignedEmployee && isRecord(assignedEmployee)) {
      const empRole = (assignedEmployee as Record<string, unknown>)['role'];

      if (empRole && isRecord(empRole) && hasObjId(empRole)) {
        roleId = empRole._id.toString();
      } else if (typeof empRole === 'string') {
        const roleDoc = await Role.findOne({ name: empRole }).lean();
        roleId = roleDoc ? ((roleDoc as Record<string, unknown>)['_id'] as { toString(): string }).toString() : null;
      }
    }

    const task = await Task.create({
      title,
      description,
      assignedBy,       // ✅ from cookie/header
      assignedTo,
      role: roleId,
      priority,
      status,
      dueDate,
      progressUpdates: [],
    });

    return NextResponse.json({ success: true, task }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error';
    console.error('Error in POST /api/tasks:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}


// PUT /api/tasks
export async function PUT(request: NextRequest) {
  try {
    await dbConnect();

    const caller = identifyCaller(request);
    if (!caller) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins or users with canAssignTasks may update
    if (caller.kind !== 'admin') {
      const roleDoc = await getUserRole(caller.userId);
      if (!roleDoc?.permissions?.canAssignTasks) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    const raw = await request.json();
    const body = isRecord(raw) ? (raw as Record<string, unknown>) : {};
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) {
      return NextResponse.json({ success: false, error: 'Task id is required' }, { status: 400 });
    }

    // Build $set update
    const update: Record<string, unknown> = {};

    if (typeof body.title === 'string') update.title = body.title.trim();
    if (typeof body.description === 'string') update.description = body.description;

    if (body.priority === 'low' || body.priority === 'medium' || body.priority === 'high') {
      update.priority = body.priority;
    }

    if (
      body.status === 'pending' ||
      body.status === 'in-progress' ||
      body.status === 'completed' ||
      body.status === 'cancelled'
    ) {
      update.status = body.status;
    }

    const dueDate = parseDateMaybe(body.dueDate);
    if (dueDate) update.dueDate = dueDate;

    if (typeof body.assignedTo === 'string' && body.assignedTo) {
      update.assignedTo = body.assignedTo;

      // Recalculate role based on assignee (matches your POST logic)
      const assignedEmployee = await Employee.findById(body.assignedTo).populate('role').lean();
      let roleId: string | null = null;

      if (assignedEmployee && isRecord(assignedEmployee)) {
        const empRole = (assignedEmployee as Record<string, unknown>)['role'];

        if (empRole && isRecord(empRole) && hasObjId(empRole)) {
          roleId = empRole._id.toString();
        } else if (typeof empRole === 'string') {
          const roleDoc = await Role.findOne({ name: empRole }).lean();
          roleId = roleDoc ? ((roleDoc as any)._id as { toString(): string }).toString() : null;
        }
      }

      update.role = roleId;
    }

    const task = await Task.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!task) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, task });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error';
    console.error('Error in PUT /api/tasks:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** DELETE /api/tasks/[id] — delete a task */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await dbConnect();

    const caller = identifyCaller(req);
    if (!caller) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { id } = params;
    const task = await Task.findById(id).lean();
    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });

    // Permission: admin OR canAssignTasks OR assignee OR creator (employee-created)
    let allowed = caller.kind === 'admin';
    if (!allowed && caller.kind === 'employee') {
      const roleDoc = await getUserRole(caller.userId);
      if (roleDoc?.permissions?.canAssignTasks) allowed = true;
      if (!allowed && task.assignedTo?.toString?.() === caller.userId) allowed = true;
      if (!allowed && typeof task.assignedBy === 'string' && task.assignedBy === caller.userId) allowed = true;
    }
    if (!allowed) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });

    await Task.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error('Error in DELETE /api/tasks/[id]:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}