// lib/serverAuth.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Employee from '@/models/Employee';
import Role, { IPermissions } from '@/models/Role';

export type PermissionKey = keyof IPermissions;

/** Sensible defaults when a user has no role or is unauthenticated */
export const defaultPermissions: IPermissions = {
  canCheckIn: false,
  canManageEmployees: false,
  canManageDepartments: false,
  canManageRoles: false,
  canAssignTasks: false,
  canViewAllTasks: false,
  canViewTasks: true,
  canViewReports: false,
};

/** Minimal shapes we care about when using .lean() */
type LeanEmployee = {
  _id: unknown;
  // In many schemas this is a string role name; keep flexible but narrow:
  role?: string | { name?: string } | null;
};

type LeanRole = {
  _id: unknown;
  name: string;
  permissions?: IPermissions;
};

type GetUserAndPerms = {
  user: LeanEmployee | null;
  role: LeanRole | null;
  permissions: IPermissions;
};

export async function getUserAndPerms(req: NextRequest): Promise<GetUserAndPerms> {
  await dbConnect();

  // You already pass x-user-id from the client
  const userId = req.headers.get('x-user-id');

  if (!userId) {
    return { user: null, role: null, permissions: { ...defaultPermissions } };
  }

  const user = await Employee.findById(userId).lean<LeanEmployee | null>();
  if (!user) {
    return { user: null, role: null, permissions: { ...defaultPermissions } };
  }

  // Resolve a role name defensively (could be a string or an object with name)
  const roleName =
    typeof user.role === 'string'
      ? user.role
      : (user.role && typeof user.role === 'object' ? user.role.name : undefined);

  if (!roleName) {
    return { user, role: null, permissions: { ...defaultPermissions } };
  }

  const roleDoc = await Role.findOne({ name: roleName })
    .select('_id name permissions')
    .lean<LeanRole | null>();

  const permissions: IPermissions = roleDoc?.permissions ?? { ...defaultPermissions };

  return { user, role: roleDoc, permissions };
}

/**
 * Quick guard for API routes:
 *   const forbidden = await requirePermission(req, 'canManageEmployees');
 *   if (forbidden) return forbidden;
 */
export async function requirePermission(req: NextRequest, key: PermissionKey) {
  const { permissions } = await getUserAndPerms(req);
  if (!permissions[key]) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}
