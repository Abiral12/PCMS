import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Employee from '@/models/Employee'; // Assuming you have an Employee model
import lunch from '@/models/lunch';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    
    // Get employeeId from query parameters
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    
    // Build query object
    let query = {};
    if (employeeId) {
      query = { employeeId };
    }
    
    const lunchTimes = await lunch.find(query)
      .populate('employeeId', 'name email position')
      .sort({ employeeName: 1 })
      .lean();
    
    return NextResponse.json({ 
      success: true,
      lunchTimes 
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
    
    // Validate required fields
    if (!body.employeeId || !body.startTime || !body.endTime || !body.days) {
      return NextResponse.json(
        { success: false, error: 'Employee ID, start time, end time, and days are required' },
        { status: 400 }
      );
    }

    // Validate time format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(body.startTime) || !timeRegex.test(body.endTime)) {
      return NextResponse.json(
        { success: false, error: 'Time must be in HH:MM format' },
        { status: 400 }
      );
    }

    // Check if employee exists
    const employee = await Employee.findById(body.employeeId);
    if (!employee) {
      return NextResponse.json(
        { success: false, error: 'Employee not found' },
        { status: 404 }
      );
    }

    // Check if lunch time already exists for this employee
    const existingLunchTime = await lunch.findOne({ employeeId: body.employeeId });
    if (existingLunchTime) {
      return NextResponse.json(
        { success: false, error: 'Lunch time already assigned to this employee' },
        { status: 400 }
      );
    }

    // Create new lunch time
    const lunchTime = await lunch.create({
      employeeId: body.employeeId,
      employeeName: employee.name,
      startTime: body.startTime,
      endTime: body.endTime,
      days: body.days
    });

    // Populate the employee details
    await lunchTime.populate('employeeId', 'name email position');

    return NextResponse.json(
      { success: true, lunchTime },
      { status: 201 }
    );
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Lunch time already assigned to this employee' },
        { status: 400 }
      );
    }
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
    const { id, ...updateData } = body;
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Lunch time ID is required' },
        { status: 400 }
      );
    }

    // Check if employeeId is being updated and if it would cause a duplicate
    if (updateData.employeeId) {
      const existingLunchTime = await lunch.findOne({ 
        employeeId: updateData.employeeId,
        _id: { $ne: id } // Exclude the current document being updated
      });
      
      if (existingLunchTime) {
        return NextResponse.json(
          { success: false, error: 'Lunch time already assigned to this employee' },
          { status: 400 }
        );
      }
    }

    // Validate time format if provided
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (updateData.startTime && !timeRegex.test(updateData.startTime)) {
      return NextResponse.json(
        { success: false, error: 'Start time must be in HH:MM format' },
        { status: 400 }
      );
    }
    if (updateData.endTime && !timeRegex.test(updateData.endTime)) {
      return NextResponse.json(
        { success: false, error: 'End time must be in HH:MM format' },
        { status: 400 }
      );
    }

    // Update lunch time
    const lunchTime = await lunch.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('employeeId', 'name email position');

    if (!lunchTime) {
      return NextResponse.json(
        { success: false, error: 'Lunch time not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, lunchTime },
      { status: 200 }
    );
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Lunch time already assigned to this employee' },
        { status: 400 }
      );
    }
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
        { success: false, error: 'Lunch time ID is required' },
        { status: 400 }
      );
    }

    const lunchTime = await lunch.findByIdAndDelete(id);

    if (!lunchTime) {
      return NextResponse.json(
        { success: false, error: 'Lunch time not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Lunch time deleted successfully' },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}