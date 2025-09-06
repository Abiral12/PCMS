// app/api/tasks/[id]/progress/route.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { Types, HydratedDocument } from 'mongoose';
import dbConnect from '@/lib/mongodb';
import Task from '@/models/Task';

type Params = { id: string };
type Ctx = { params: Params } | { params: Promise<Params> };

// Helper: during build, params may be a Promise
function isPromise<T>(x: unknown): x is Promise<T> {
  return !!x && typeof (x as Promise<T>).then === 'function';
}

// Shape of a progress entry as stored on Task
type Progress = {
  message: string;
  timestamp: Date | string; // lean() may return Date or serialized
};

// POST /api/tasks/[id]/progress  — add a progress entry (assignee only)
export async function POST(request: NextRequest, context: Ctx) {
  try {
    await dbConnect();

    const { id } = isPromise<Params>(context.params)
      ? await context.params
      : context.params;

    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { message, status } = (await request.json()) as {
      message?: string;
      status?: 'pending' | 'in-progress' | 'completed' | 'cancelled';
    };

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 });
    }

    // Verify the requester is the assignee
    const taskAssignee = await Task.findById(id).select('assignedTo').lean<{ assignedTo?: unknown } | null>();
    if (!taskAssignee) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    }
    const isAssignee = (taskAssignee.assignedTo as { toString(): string } | undefined)?.toString() === userId;
    if (!isAssignee) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    // Push progress without mutating a hydrated doc (avoids typing issues)
    const update: Record<string, unknown> = {
      $push: { progressUpdates: { message, timestamp: new Date() } },
    };
    if (status) {
      update.$set = { status };
    }

    await Task.updateOne({ _id: id }, update);

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// GET /api/tasks/[id]/progress  — list progress entries
export async function GET(request: NextRequest, context: Ctx) {
  try {
    await dbConnect();

    const { id } = isPromise<Params>(context.params)
      ? await context.params
      : context.params;

    const task = await Task.findById(id)
      .select('progressUpdates')
      .lean<{ progressUpdates?: Progress[] } | null>();

    if (!task) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    }

    const messages: Progress[] = Array.isArray(task.progressUpdates)
      ? task.progressUpdates
      : [];

    return NextResponse.json({ success: true, messages });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
