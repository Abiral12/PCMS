// // lib/authz.ts
// import { NextRequest, NextResponse } from 'next/server';
// import dbConnect from '@/lib/mongodb';
// import Employee from '@/models/Employee';
// import Role from '@/models/Role';
// import type { IPermissions } from '@/models/Role';

// const defaultPerms: IPermissions = {
//   canCheckIn: false,
//   canManageEmployees: false,
//   canManageDepartments: false,
//   canManageRoles: false,
//   canAssignTasks: false,
//   canViewAllTasks: false,
//   canViewTasks: false,
//   canViewReports: false,
// };

// export async function getUserAndPerms(req: NextRequest) {
//   await dbConnect();
//   const userId = req.headers.get('x-user-id');
//   if (!userId) throw new Error('Missing x-user-id');

//   const user = await Employee.findById(userId).lean();
//   if (!user) throw new Error('User not found');

//   const roleDoc = await Role.findOne({ name: user.role }).lean();
//   const permissions: IPermissions = roleDoc?.permissions ?? defaultPerms;

//   return { user, permissions };
// }

// export async function requirePerm(
//   req: NextRequest,
//   perm: keyof IPermissions
// ): Promise<{ user: any; permissions: IPermissions } | NextResponse> {
//   try {
//     const ctx = await getUserAndPerms(req);
//     if (!ctx.permissions[perm]) {
//       return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
//     }
//     return ctx;
//   } catch (e: any) {
//     const msg = e?.message || 'Unauthorized';
//     const code = msg.includes('Missing') ? 401 : 401;
//     return NextResponse.json({ error: msg }, { status: code });
//   }
// }
