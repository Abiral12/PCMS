import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Department from '@/models/Department';

export async function GET() {
  try {
    await dbConnect();
    
    const departments = await Department.find({}).sort({ name: 1 }).lean();
    
    return NextResponse.json({ 
      success: true,
      departments 
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    
    if (!body.name) {
      return NextResponse.json(
        { success: false, error: 'Department name is required' },
        { status: 400 }
      );
    }

    const department = await Department.create({
      name: body.name,
      description: body.description
    });

    return NextResponse.json(
      { success: true, department },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}


export async function PUT(request: NextRequest) {
  try {
    await dbConnect();
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json(
        { success: false, error: 'Department id is required' },
        { status: 400 }
      );
    }

    const updated = await Department.findByIdAndUpdate(
      body.id,
      { name: body.name, description: body.description },
      { new: true }
    );

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Department not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, department: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Department id is required' },
        { status: 400 }
      );
    }

    const deleted = await Department.findByIdAndDelete(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Department not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: 'Department deleted' });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}