import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Employee from '@/models/Employee';
import Role from '@/models/Role';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

export async function POST(request: NextRequest) {
try {
    await dbConnect();

    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    const employeeDoc = await Employee.findOne({ email }); // no need to populate for this check
    if (!employeeDoc) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // ⬇️ block paused/inactive accounts BEFORE bcrypt (optional order), definitely before issuing token
    if (employeeDoc.isPaused === true) {
      return NextResponse.json(
        { error: 'Not available at this time. Contact your department head.' },
        { status: 403 }
      );
    }
    if (employeeDoc.isActive === false) {
      return NextResponse.json(
        { error: 'Account is inactive. Contact your department head.' },
        { status: 403 }
      );
    }

    const ok = await bcrypt.compare(password, employeeDoc.passwordHash || '');
    if (!ok) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Resolve role + permissions
    let roleName: string | undefined;
    let permissions: any = {};

    if (employeeDoc.role && typeof employeeDoc.role === 'object' && 'name' in employeeDoc.role) {
      roleName = (employeeDoc.role as any).name;
      permissions = (employeeDoc.role as any).permissions || {};
    } else if (employeeDoc.role) {
      const roleDoc = await Role.findOne({ name: employeeDoc.role as any });
      roleName = roleDoc?.name || (employeeDoc.role as any);
      permissions = roleDoc?.permissions || {};
    } else {
      roleName = 'Employee';
      permissions = {};
    }

    // Build JWT
    const token = jwt.sign(
      { id: employeeDoc._id.toString(), email: employeeDoc.email, role: roleName, permissions },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // ✅ Create response and set HttpOnly cookie
    const res = NextResponse.json({
      success: true,
      employee: {
        id: employeeDoc._id.toString(),
        name: employeeDoc.name,
        email: employeeDoc.email,
        position: employeeDoc.position,
        role: roleName,
        permissions,
      },
    });

    res.cookies.set({
      name: 'token',
      value: token,
      httpOnly: true,
      secure: true,   // true in production
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24,
    });

    return res;
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
