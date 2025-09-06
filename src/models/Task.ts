import mongoose, { Document, Schema } from 'mongoose';

// Progress Update Interface
interface ProgressUpdate {
  message: string;
  timestamp: Date;
}

// Task Interface
export interface ITask extends Document {
  title: string;
  description: string;
  assignedBy: string; // Employee ID who assigned the task
  assignedTo: string; // Employee ID
  role?: string; // Role ID of assigned employee
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  dueDate: Date;
  progressUpdates: ProgressUpdate[];
  createdAt: Date;
  updatedAt: Date;
}

// Progress Update Schema
const ProgressUpdateSchema = new Schema<ProgressUpdate>({
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

// Task Schema
const TaskSchema: Schema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    assignedBy: { type: String, required: true },
    assignedTo: { type: String, required: true },
    role: { type: String, required: false }, // optional Role ID
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: { type: String, enum: ['pending', 'in-progress', 'completed', 'cancelled'], default: 'pending' },
    dueDate: { type: Date, required: true },
    progressUpdates: { type: [ProgressUpdateSchema], default: [] },
  },
  { timestamps: true }
);

// Indexes for faster queries
TaskSchema.index({ assignedTo: 1, status: 1 });
TaskSchema.index({ dueDate: 1 });

export default mongoose.models.Task || mongoose.model<ITask>('Task', TaskSchema);

// 🔔 Notifications Schema
export interface INotification extends Document {
  employeeId: string;
  message: string;
  createdAt: Date;
  read: boolean;
}

const NotificationSchema: Schema = new Schema(
  {
    employeeId: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Notification =
  mongoose.models.Notification ||
  mongoose.model<INotification>('Notification', NotificationSchema);
