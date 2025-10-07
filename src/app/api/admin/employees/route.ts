import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Employee from '@/models/Employee';
import { hash } from 'bcryptjs';

export const runtime = 'nodejs';

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
      isPaused,
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
    if (typeof isPaused === 'boolean') update.isPaused = isPaused;

    if (typeof password === 'string' && password.trim().length > 0) {
      update.passwordHash = await hash(password, 12);
    }

    // Exclude passwordHash from the returned doc
    const updated = await Employee.findByIdAndUpdate(
      id,
      { $set: update },
      {
        new: true,
        runValidators: true,
        projection: { passwordHash: 0 },  // <-- key line
      }
    ).lean();

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Failed to update employee' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Employee updated successfully',
      employee: updated,  // already has no passwordHash
    });
  } catch (error: any) {
    console.error('Error updating employee:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error: ' + error.message },
      { status: 500 }
    );
  }
}

/** Delete employee (soft by default; hard with ?hard=true) */
export async function DELETE(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const hardFlag = (searchParams.get('hard') || '').toLowerCase();
    const hard = hardFlag === 'true' || hardFlag === '1' || hardFlag === 'yes';

    // id can come from query (?id=...) or JSON body { id: "..." }
    let id = searchParams.get('id');
    if (!id) {
      try {
        const body = await request.json();
        id = body?.id;
      } catch {
        /* no body provided; ignore */
      }
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing employee id' },
        { status: 400 }
      );
    }

    // Soft delete (default): mark inactive + paused and hide passwordHash
    if (!hard) {
      const updated = await Employee.findByIdAndUpdate(
        id,
        { $set: { isActive: false, isPaused: true } },
        {
          new: true,
          runValidators: true,
          projection: { passwordHash: 0 },
        }
      ).lean();

      if (!updated) {
        return NextResponse.json(
          { success: false, error: 'Employee not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Employee deactivated successfully',
        employee: updated,
      });
    }

    // Hard delete: remove the document
    const toDelete = await Employee.findByIdAndDelete(id).select('-passwordHash');
    if (!toDelete) {
      return NextResponse.json(
        { success: false, error: 'Employee not found' },
        { status: 404 }
      );
    }

    await toDelete.deleteOne();

    return NextResponse.json({
      success: true,
      message: 'Employee permanently deleted',
      employee: toDelete.toObject(),
    });
  } catch (error: any) {
    console.error('Error deleting employee:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error: ' + error.message },
      { status: 500 }
    );
  }
}
