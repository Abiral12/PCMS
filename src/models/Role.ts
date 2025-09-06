import mongoose, { Document, Schema } from 'mongoose';

export interface IPermissions {
  canCheckIn: boolean;
  canManageEmployees: boolean;
  canManageDepartments: boolean;
  canManageRoles: boolean;
  canAssignTasks: boolean;
  canViewAllTasks: boolean;
  canViewTasks: boolean;  
  canViewReports: boolean;
}

export interface IRole extends Document {
  name: string;
  department: string;
  permissions: IPermissions;
  createdAt: Date;
  updatedAt: Date;
}

const PermissionsSchema: Schema = new Schema({
  canCheckIn: { type: Boolean, default: false },
  canManageEmployees: { type: Boolean, default: false },
  canManageDepartments: { type: Boolean, default: false },
  canManageRoles: { type: Boolean, default: false },
  canAssignTasks: { type: Boolean, default: false },
  canViewAllTasks: { type: Boolean, default: false },
  canViewTasks: { type: Boolean, default: true }, 
  canViewReports: { type: Boolean, default: false }
});

const RoleSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    department: {
      type: String,
      required: true
    },
    permissions: {
      type: PermissionsSchema,
      required: true,
      default: () => ({})
    }
  },
  {
    timestamps: true
  }
);

RoleSchema.index({ name: 1, department: 1 }, { unique: true });

export default mongoose.models.Role || mongoose.model<IRole>('Role', RoleSchema);