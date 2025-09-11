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
  canAssignTasksAllDepartments?: boolean;
  canCheckIn?: boolean;
  canManageEmployees?: boolean;
  canManageDepartments?: boolean;
  canManageRoles?: boolean;
  canViewAllTasks?: boolean;
  canViewTasks?: boolean;
  canViewReports?: boolean;
};

type RoleLean =
  | {
      _id?: { toString(): string } | string;
      name?: string;
      department?: string;
      permissions?: Perms;
    }
  | null;

type Caller =
  | { kind: 'admin'; username: string }
  | { kind: 'employee'; userId: string }
  | null;

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
function identifyCaller(req: NextRequest): Caller {
  const path = req.nextUrl.pathname;

  // Only elevate to admin on /api/admin/* routes (NOT here)
  if (path.startsWith('/api/admin')) {
    const adminToken = req.cookies.get('admin_token')?.value;
    if (adminToken) {
      try {
        const payload = jwt.verify(adminToken, JWT_SECRET) as { role?: string; username?: string };
        if (payload?.role === 'Admin') {
          return { kind: 'admin', username: payload.username || 'Admin' };
        }
      } catch {
        /* ignore bad/expired token */
      }
    }
  }

  // Employee identity (header wins, then cookie)
  const fromHeader = req.headers.get('x-user-id');
  if (fromHeader) return { kind: 'employee', userId: String(fromHeader) };

  const fromCookie = req.cookies.get('employeeId')?.value;
  if (fromCookie) return { kind: 'employee', userId: fromCookie };

  return null;
}



async function getUserRole(userId: string): Promise<RoleLean> {
  const employee = await Employee.findById(userId).populate('role').lean();

  const roleValue = isRecord(employee) ? (employee as Record<string, unknown>)['role'] : null;

  // If role is populated object
  if (roleValue && isRecord(roleValue) && hasObjId(roleValue)) {
    const { _id } = roleValue as any;
    return {
      _id,
      permissions: (roleValue as any)?.permissions as Perms | undefined,
      department: (roleValue as any)?.department as string | undefined,
      name: (roleValue as any)?.name as string | undefined,
    };
  }

  // If role is just a name string, look it up
  if (typeof roleValue === 'string') {
    const roleDoc = await Role.findOne({ name: roleValue }).lean();
    if (roleDoc) {
      return {
        _id: (roleDoc as any)._id as { toString(): string },
        permissions: (roleDoc as any).permissions as Perms | undefined,
        department: (roleDoc as any).department as string | undefined,
        name: (roleDoc as any).name as string | undefined,
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

async function getEmployeeDepartment(userId: string): Promise<string | null> {
  const emp = await Employee.findById(userId).lean();
  const d = (emp as any)?.department;
  if (!d) return null;
  return typeof d === 'string' ? d : String(d);
}

function failClosedDeptCheck(opts: {
  allDepts: boolean;
  actorDept: string | null;
  targetDept: string | null;
}) {
  const { allDepts, actorDept, targetDept } = opts;
  if (allDepts) return; // allowed everywhere
  // If either department is missing or they differ, block.
  if (!actorDept || !targetDept || actorDept !== targetDept) {
    throw new Error('DEPT_FORBIDDEN'); // will be mapped to 403 below
  }
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
    let actorRole: RoleLean = null;
    if (caller.kind !== 'admin') {
      actorRole = await getUserRole(caller.userId);
      if (!actorRole?.permissions?.canAssignTasks) {
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
      body.status === 'pending' ||
      body.status === 'in-progress' ||
      body.status === 'completed' ||
      body.status === 'cancelled'
        ? body.status
        : 'pending';

    const assignedBy = caller.kind === 'admin' ? caller.username || 'Admin' : caller.userId;

    if (!title || !assignedTo || !dueDate) {
      return NextResponse.json(
        { success: false, error: 'Title, assignedTo, and valid dueDate are required' },
        { status: 400 }
      );
    }

    // Resolve assignee (and its department)
    const assignedEmployee = await Employee.findById(assignedTo).populate('role').lean();
    if (!assignedEmployee) {
      return NextResponse.json({ success: false, error: 'Assignee not found' }, { status: 400 });
    }

    // SCOPE CHECK: employee assigners must stay inside their department unless all-depts
    if (caller.kind !== 'admin') {
      const allDepts = !!actorRole?.permissions?.canAssignTasksAllDepartments;
      const actorDept = await getEmployeeDepartment(caller.userId);
      const assigneeDept = await getEmployeeDepartment(assignedTo);

      try {
        failClosedDeptCheck({ allDepts, actorDept, targetDept: assigneeDept });
      } catch (e) {
        if ((e as Error).message === 'DEPT_FORBIDDEN') {
          return NextResponse.json(
            { success: false, error: 'Cannot assign tasks outside your department' },
            { status: 403 }
          );
        }
        throw e;
      }
    }

    // Compute task.role based on assignee’s role
    let roleId: string | null = null;
    if (assignedEmployee && isRecord(assignedEmployee)) {
      const empRole = (assignedEmployee as Record<string, unknown>)['role'];
      if (empRole && isRecord(empRole) && hasObjId(empRole)) {
        roleId = (empRole as any)._id.toString();
      } else if (typeof empRole === 'string') {
        const roleDoc = await Role.findOne({ name: empRole }).lean();
        roleId = roleDoc ? ((roleDoc as any)._id as { toString(): string }).toString() : null;
      }
    }

    const task = await Task.create({
      title,
      description,
      assignedBy,
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
    let actorRole: RoleLean = null;
    if (caller.kind !== 'admin') {
      actorRole = await getUserRole(caller.userId);
      if (!actorRole?.permissions?.canAssignTasks) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    const raw = await request.json();
    const body = isRecord(raw) ? (raw as Record<string, unknown>) : {};
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) {
      return NextResponse.json({ success: false, error: 'Task id is required' }, { status: 400 });
    }

    // Fetch existing to know current assignee for scope enforcement
    const existing = await Task.findById(id).lean();
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    }

    // Determine who the target assignee will be after this update
    const targetAssigneeId =
      typeof body.assignedTo === 'string' && body.assignedTo
        ? body.assignedTo
        : (existing as any).assignedTo?.toString?.() || '';

    // If employee actor, enforce scope against the target assignee’s department
    if (caller.kind !== 'admin' && targetAssigneeId) {
      const allDepts = !!actorRole?.permissions?.canAssignTasksAllDepartments;
      const actorDept = await getEmployeeDepartment(caller.userId);
      const targetDept = await getEmployeeDepartment(targetAssigneeId);

      try {
        failClosedDeptCheck({ allDepts, actorDept, targetDept });
      } catch (e) {
        if ((e as Error).message === 'DEPT_FORBIDDEN') {
          return NextResponse.json(
            { success: false, error: 'Cannot assign or modify tasks outside your department' },
            { status: 403 }
          );
        }
        throw e;
      }
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

    // If changing assignee, also recalc role like in POST
    if (typeof body.assignedTo === 'string' && body.assignedTo) {
      update.assignedTo = body.assignedTo;

      const assignedEmployee = await Employee.findById(body.assignedTo).populate('role').lean();
      let roleId: string | null = null;
      if (assignedEmployee && isRecord(assignedEmployee)) {
        const empRole = (assignedEmployee as Record<string, unknown>)['role'];
        if (empRole && isRecord(empRole) && hasObjId(empRole)) {
          roleId = (empRole as any)._id.toString();
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

// DELETE /api/tasks?id=<taskId>   (or JSON body { id })
export async function DELETE(request: NextRequest) {
  try {
    await dbConnect();

    const caller = identifyCaller(request);
    if (!caller) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Prefer query param; fallback to JSON body
    const { searchParams } = new URL(request.url);
    let id = searchParams.get('id');

    if (!id) {
      try {
        const body = await request.json();
        if (isRecord(body) && typeof body.id === 'string') id = body.id;
      } catch {
        /* body may be empty; ignore */
      }
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Task id is required (?id= or JSON body { id })' },
        { status: 400 }
      );
    }

    let allowed = caller.kind === 'admin';

    if (!allowed && caller.kind === 'employee') {
      const roleDoc = await getUserRole(caller.userId);
      const task = await Task.findById(id).lean();
      if (!task) {
        return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
      }

      const toStr = (v: any) => (typeof v === 'string' ? v : v?.toString?.());

      // Always allow deleting your own task or a task you created
      if (toStr((task as any).assignedTo) === caller.userId || (task as any).assignedBy === caller.userId) {
        allowed = true;
      } else if (roleDoc?.permissions?.canAssignTasks) {
        // If you can assign tasks, you can delete within your department unless you have all-depts
        const allDepts = !!roleDoc.permissions?.canAssignTasksAllDepartments;
        if (allDepts) {
          allowed = true;
        } else {
          const actorDept = await getEmployeeDepartment(caller.userId);
          const assigneeDept = await getEmployeeDepartment(toStr((task as any).assignedTo));
          allowed = !!actorDept && !!assigneeDept && actorDept === assigneeDept; // fail-closed
        }
      }
    }

    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const deleted = await Task.findByIdAndDelete(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error';
    console.error('Error in DELETE /api/tasks:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
