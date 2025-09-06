import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Employee from '@/models/Employee';
import { hash } from 'bcryptjs';

export async function GET() {
  try {
    await dbConnect();

    const employees = await Employee.find({ isActive: true })
      .select('-passwordHash')
      .sort({ department: 1, name: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      employees
    });
  } catch (error: any) {
    console.error('Error fetching employees:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error: ' + error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();

    const { name, email, password, department, role, position } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { success: false, error: 'Name, email, and password are required' },
        { status: 400 }
      );
    }

    const existingEmployee = await Employee.findOne({ email });
    if (existingEmployee) {
      return NextResponse.json(
        { success: false, error: 'Employee with this email already exists' },
        { status: 400 }
      );
    }

    const passwordHash = await hash(password, 12);

    const employee = await Employee.create({
      name,
      email,
      passwordHash,
      department: department || 'General',
      role: role || 'Employee',
      position: position || 'Employee',
      isActive: true
    });

    const { passwordHash: _, ...employeeWithoutPassword } = employee.toObject();

    return NextResponse.json(
      {
        success: true,
        message: 'Employee created successfully',
        employee: employeeWithoutPassword
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating employee:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error: ' + error.message },
      { status: 500 }
    );
  }
}

/** Update employee */
export async function PUT(request: NextRequest) {
  try {
    await dbConnect();
    const body = await request.json();

    const {
      id, name, email, department, role, position, password,
      isPaused,              // <— NEW (optional)
    } = body || {};

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing employee id' }, { status: 400 });
    }

    const emp = await Employee.findById(id);
    if (!emp || emp.isActive === false) {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 });
    }

    if (email && email !== emp.email) {
      const dup = await Employee.findOne({ email });
      if (dup && String(dup._id) !== String(id)) {
        return NextResponse.json({ success: false, error: 'Another employee with this email already exists' }, { status: 400 });
      }
    }

    const update: Record<string, any> = {};
    if (typeof name === 'string') update.name = name;
    if (typeof email === 'string') update.email = email;
    if (typeof department === 'string') update.department = department || 'General';
    if (typeof role === 'string') update.role = role || 'Employee';
    if (typeof position === 'string') update.position = position || 'Employee';
    if (typeof isPaused === 'boolean') update.isPaused = isPaused; // <— persist pause

    if (typeof password === 'string' && password.trim().length > 0) {
      update.passwordHash = await hash(password, 12);
    }

    const updated = await Employee.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true }).lean();
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Failed to update employee' }, { status: 500 });
    }

    const { passwordHash: _ph, ...withoutPass } = updated;
    return NextResponse.json({ success: true, message: 'Employee updated successfully', employee: withoutPass });
  } catch (error: any) {
    console.error('Error updating employee:', error);
    return NextResponse.json({ success: false, error: 'Internal server error: ' + error.message }, { status: 500 });
  }
}

/** Delete employee (soft delete by default) */
export async function DELETE(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const hard = searchParams.get('hard') === 'true'; // optional: /api/admin/employees?id=...&hard=true

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing employee id' },
        { status: 400 }
      );
    }

    // Soft delete: set isActive=false so your GET (isActive: true) hides them
    let result;
    if (hard) {
      // Hard delete (optional)
      result = await Employee.findByIdAndDelete(id);
    } else {
      result = await Employee.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true });
    }

    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Employee not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: hard ? 'Employee permanently deleted' : 'Employee deactivated'
    });
  } catch (error: any) {
    console.error('Error deleting employee:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error: ' + error.message },
      { status: 500 }
    );
  }
}