import mongoose, { Schema, Types } from 'mongoose';

export interface INotificationDelivery {
  _id: Types.ObjectId;
  scheduleId?: Types.ObjectId | null;
  notificationId?: Types.ObjectId | null;
  employeeId: string;                    // store as string for simplicity
  title: string;
  body: string;
  url?: string;
  status: 'sent' | 'acked' | 'expired';
  sentAt: Date;
  ackedAt?: Date | null;
  expiresAt?: Date | null;               // sentAt + 15min
  forcedCheckoutAt?: Date | null;
  meta?: Record<string, any>;
}

const Delivery = new Schema<INotificationDelivery>(
  {
    scheduleId: { type: Schema.Types.ObjectId, ref: 'NotificationSchedule', default: null, index: true },
    notificationId: { type: Schema.Types.ObjectId, ref: 'Notification', default: null, index: true },
    employeeId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    url: { type: String },
    status: { type: String, enum: ['sent', 'acked', 'expired'], default: 'sent', index: true },
    sentAt: { type: Date, default: () => new Date(), index: true },
    ackedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null, index: true },
    forcedCheckoutAt: { type: Date, default: null },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default (mongoose.models.NotificationDelivery as mongoose.Model<INotificationDelivery>)
  || mongoose.model<INotificationDelivery>('NotificationDelivery', Delivery);
