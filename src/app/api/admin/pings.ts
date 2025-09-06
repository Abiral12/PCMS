import { NextApiRequest, NextApiResponse } from 'next';
import connectToDB from '@/lib/mongodb';
import Ping from '@/models/Ping';
import Employee from '@/models/Employee';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  await connectToDB();

  const { type } = req.query; // ?type=report OR ?type=pings

  try {
    if (type === 'report') {
      // --- Weekly Report ---
      const employees = await Employee.find().lean();

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const pings = await Ping.find({ timestamp: { $gte: weekAgo } }).lean();

      const report = employees.map((emp: any) => {
  const empId = String(emp._id); // 👈 cast _id to string
  const empPings = pings.filter(p => p.employeeId === empId);

  return {
    employeeId: empId,
    name: emp.name,
    totalPings: empPings.length,
    lastPing: empPings.length ? empPings[0].timestamp : null,
  };
});


      return res.status(200).json({ mode: 'report', report });
    } else {
      // --- All Pings (default) ---
      const pings = await Ping.find().sort({ timestamp: -1 }).lean();
      return res.status(200).json({ mode: 'pings', pings });
    }
  } catch (e) {
    console.error('Error in /api/admin/pings:', e);
    res.status(500).json({ message: 'Failed to fetch data' });
  }
}
