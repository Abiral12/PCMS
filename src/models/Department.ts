import mongoose, { Document, Schema } from 'mongoose';

export interface IDepartment extends Document {
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    description: {
      type: String,
      required: false
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.models.Department || mongoose.model<IDepartment>('Department', DepartmentSchema);