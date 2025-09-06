// export type IPermissions = {
//   canCheckIn: boolean;
//   canManageEmployees: boolean;
//   canManageDepartments: boolean;
//   canManageRoles: boolean;
//   canAssignTasks: boolean;
//   canViewAllTasks: boolean;
//   canViewTasks: boolean;
//   canViewReports: boolean;
// };

// let cache: IPermissions | null = null;

// export async function initPermissions(userId: string): Promise<IPermissions> {
//   const res = await fetch('/api/me', { headers: { 'x-user-id': userId } });
//   if (!res.ok) throw new Error('Failed to load permissions');

//   const data = await res.json();
//   cache = data.permissions as IPermissions;

//   if (!cache) throw new Error('Permissions not found'); // safeguard
//   return cache;
// }

// export function has(perm: keyof IPermissions) {
//   return !!cache?.[perm];
// }
