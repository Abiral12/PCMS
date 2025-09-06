// // app/api/me/route.ts
// import { NextResponse } from 'next/server';
// import dbConnect from '@/lib/mongodb';
// import Employee, { IEmployee } from '@/models/Employee';
// import Role, { IRole } from '@/models/Role';

// export async function GET(request: Request) {
//   try {
//     await dbConnect();

//     const userId = request.headers.get('x-user-id');
//     if (!userId) {
//       return NextResponse.json({ error: 'Missing x-user-id' }, { status: 401 });
//     }

//     // ✅ returns a single doc, not an array
//     const user = await Employee.findById(userId).lean<IEmployee | null>();
//     if (!user) {
//       return NextResponse.json({ error: 'User not found' }, { status: 404 });
//     }

//     // ✅ since Employee.role is a string
//     const role = await Role.findOne({
//       name: user.role,
//       department: user.department,
//     }).lean<IRole | null>();

//     const permissions = role?.permissions ?? {
//       canCheckIn: false,
//       canManageEmployees: false,
//       canManageDepartments: false,
//       canManageRoles: false,
//       canAssignTasks: false,
//       canViewAllTasks: false,
//       canViewTasks: false,
//       canViewReports: false,
//     };

//     return NextResponse.json({
//       user: {
//         _id: String(user._id),
//         name: user.name,
//         email: user.email,
//         department: user.department,
//         role: user.role,
//       },
//       permissions,
//     });
//   } catch (e) {
//     console.error(e);
//     return NextResponse.json({ error: 'Server error' }, { status: 500 });
//   }
// }
