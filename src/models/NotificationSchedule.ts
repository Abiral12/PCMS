import mongoose, { Schema, Types } from 'mongoose';

export interface INotificationSchedule {
  _id: Types.ObjectId;
  employeeId: string;      // keep as string to match your Notification model
  title: string;
  body: string;
  url?: string;
  everyMinutes: number;    // 15, 30, 60...
  startAt: Date;           // absolute UTC
  stopAt: Date;            // absolute UTC
  tz?: string;             // IANA TZ, e.g. 'Asia/Kathmandu'
  scheduleId?: string;     // QStash schedule id (we’ll set to _id string)
  active: boolean;
  createdBy?: string;
}

const schema = new Schema<INotificationSchedule>({
  employeeId: { type: String, required: true, index: true },
  title: { type: String, required: true, trim: true },
  body: { type: String, required: true, trim: true },
  url: { type: String },
  everyMinutes: { type: Number, required: true, min: 1 },
  startAt: { type: Date, required: true },
  stopAt: { type: Date, required: true },
  tz: { type: String, default: 'Asia/Kathmandu' },
  scheduleId: { type: String },
  active: { type: Boolean, default: true },
  createdBy: { type: String },
}, { timestamps: true });

export default mongoose.models.NotificationSchedule
  || mongoose.model<INotificationSchedule>('NotificationSchedule', schema);
