import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import LunchLog from '@/models/LunchLog';
import LunchTime from '@/models/lunch';

export async function GET(req: NextRequest) {
  await dbConnect();

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employeeId");

  if (!employeeId) {
    return NextResponse.json({ error: "Missing employeeId" }, { status: 400 });
  }

  // Get allowed schedule
  const schedule = await LunchTime.findOne({ employeeId });
  let allowedMinutes = 0;
  if (schedule) {
    const [sh, sm] = schedule.startTime.split(":").map(Number);
    const [eh, em] = schedule.endTime.split(":").map(Number);
    allowedMinutes = (eh * 60 + em) - (sh * 60 + sm);
  }

  // Get actual logs
  const logs = await LunchLog.find({ employeeId }).sort({ timestamp: 1 });

  let totalMinutes = 0;
  for (let i = 0; i < logs.length; i++) {
    if (logs[i].type === "lunch-start" && logs[i + 1]?.type === "lunch-end") {
      const diff = (logs[i + 1].timestamp.getTime() - logs[i].timestamp.getTime()) / (1000 * 60);
      totalMinutes += diff;
      i++;
    }
  }

  return NextResponse.json({
    employeeId,
    allowedMinutes,
    totalMinutes,
    difference: totalMinutes - allowedMinutes
  });
}
