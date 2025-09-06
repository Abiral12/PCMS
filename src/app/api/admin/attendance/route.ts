// app/api/admin/attendance/route.ts
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import Employee from '@/models/Employee';

export const runtime = 'nodejs';
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_change_me';

function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('admin_token')?.value;
  if (!token) return { ok: false as const, error: 'Unauthorized' };
  try {
    const p = jwt.verify(token, JWT_SECRET) as { role: string; username: string };
    if (p.role !== 'Admin') return { ok: false as const, error: 'Forbidden' };
    return { ok: true as const, admin: p };
  } catch {
    return { ok: false as const, error: 'Invalid token' };
  }
}

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: 401 });

  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const page  = Math.max(1, parseInt(searchParams.get('page')  || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10) || 10));
    const employeeId = searchParams.get('employeeId') || undefined;

    const skip = (page - 1) * limit;
    const query: Record<string, unknown> = {};
    if (employeeId) query.employeeId = employeeId;

    const total = await Attendance.countDocuments(query);

    // fetch rows; populate if available
    let rows: any[];
    try {
      rows = await Attendance.find(query)
        .populate('employeeId', 'name email position') // ref MUST be "Employee"
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
    } catch {
      rows = await Attendance.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
    }

    // collect ids that still lack a name
    const idsNeedingName = new Set<string>();
    for (const rec of rows) {
      const hasName = rec?.employeeId && typeof rec.employeeId === 'object' && rec.employeeId?.name;
      if (!hasName && rec.employeeId != null) {
        const id =
          rec.employeeId?._id?.toString?.() ??
          (typeof rec.employeeId === 'object' ? rec.employeeId.toString?.() : String(rec.employeeId));
        if (id) idsNeedingName.add(String(id));
      }
    }

    // lookup names once
    const nameMap = new Map<string, string>();
    if (idsNeedingName.size) {
      const emps = await Employee.find(
        { _id: { $in: Array.from(idsNeedingName) } },
        { name: 1 }
      ).lean();
      emps.forEach((e: any) => nameMap.set(String(e._id), String(e.name ?? '')));
    }

    const attendance = rows.map((rec: any) => {
      const eid =
        rec.employeeId?._id?.toString?.() ??
        (typeof rec.employeeId === 'object' ? rec.employeeId.toString?.() : String(rec.employeeId));

      const ename =
        (rec.employeeId && typeof rec.employeeId === 'object' ? rec.employeeId.name : null) ||
        (eid ? nameMap.get(String(eid)) : '') ||
        'Unknown';

      return {
        _id: String(rec._id),
        employeeId: String(eid ?? ''),
        employeeName: ename,
        type: rec.type,
        timestamp: rec.timestamp,
        imageData: rec.imageData ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      attendance,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error: any) {
    console.error('GET /api/admin/attendance - Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}
