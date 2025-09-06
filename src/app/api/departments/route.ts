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