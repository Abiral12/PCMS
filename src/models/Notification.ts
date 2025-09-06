import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
  toEmployeeId: string;
  fromAdminId: string;
  message: string;
  type: 'admin_message' | 'work_check';
  createdAt: Date;
  read: boolean;
}

const NotificationSchema: Schema = new Schema(
  {
    toEmployeeId: {
      type: String,
      required: true
    },
    fromAdminId: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['admin_message', 'work_check'],
      default: 'admin_message'
    },
    read: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

NotificationSchema.index({ toEmployeeId: 1, read: 1 });
NotificationSchema.index({ createdAt: 1 });

export default mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);