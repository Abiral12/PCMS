export interface CheckInOutData {
  type: 'checkin' | 'checkout';
  timestamp: Date;
  employeeId: string;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  position: string;
}
import { NextApiRequest, NextApiResponse } from 'next';
import mongoose from 'mongoose';
import Task from '@/models/Task';

mongoose.connect(process.env.MONGODB_URI!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  if (method === 'GET') {
    const tasks = await Task.find({});
    return res.status(200).json({ tasks });
  }

  if (method === 'POST') {
    const { title, description, assignedTo } = req.body;
    if (!title || !assignedTo) return res.status(400).json({ error: 'Missing fields' });

    const task = await Task.create({ title, description, assignedTo });
    return res.status(200).json(task);
  }

  res.status(405).end();
}


