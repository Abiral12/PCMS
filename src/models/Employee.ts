import mongoose, { Document, Schema } from 'mongoose';

export interface IEmployee extends Document {
  name: string;
  email: string;
  passwordHash: string;
  department: string;
  role: string;
  position: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    department: {
      type: String,
      required: true,
      default: 'General'
    },
    role: {
      type: String,
      required: true,
      default: 'Employee'
    },
    position: {
      type: String,
      required: true
    },
isActive: { type: Boolean, default: true },
  isPaused: { type: Boolean, default: false }, 
  },
  {
    timestamps: true
  }
);

EmployeeSchema.index({ email: 1 });
EmployeeSchema.index({ department: 1, role: 1 });

export default mongoose.models.Employee || mongoose.model<IEmployee>('Employee', EmployeeSchema);