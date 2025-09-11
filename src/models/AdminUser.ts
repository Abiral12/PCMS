// models/AdminUser.ts
import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAdminUser extends Document {
  username: string;
  passwordHash: string;
  roles: string[]; // e.g., ["Admin"]
  updatedAt: Date;
  createdAt: Date;
}

const AdminUserSchema = new Schema<IAdminUser>(
  {
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    roles: { type: [String], default: ["Admin"] },
  },
  { timestamps: true }
);

export default (mongoose.models.AdminUser as Model<IAdminUser>) ||
  mongoose.model<IAdminUser>('AdminUser', AdminUserSchema);
