import mongoose, { Schema, Document } from 'mongoose';

export interface IProgressMessage extends Document {
  taskId: string;       // stored as string in your calls
  employeeId: string;   // stored as string in your calls
  message: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProgressMessageSchema = new Schema<IProgressMessage>(
  {
    taskId: { type: String, required: true },
    employeeId: { type: String, required: true },
    message: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

export default mongoose.models.ProgressMessage ||
  mongoose.model<IProgressMessage>('ProgressMessage', ProgressMessageSchema);
