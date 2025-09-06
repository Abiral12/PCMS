import mongoose, { Document, Schema } from 'mongoose';

export interface ICheckin extends Document {
  employeeId: string;
  employeeName: string;
  type: 'checkin' | 'checkout';
  timestamp: Date;
  imageData: string; // Store the image data
  createdAt: Date;
  updatedAt: Date;
}

const CheckinSchema: Schema = new Schema(
  {
    employeeId: {
      type: String,
      required: true,
      index: true
    },
    employeeName: {
      type: String,
      required: true
    },
    type: {
      type: String,
      required: true,
      enum: ['checkin', 'checkout']
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now
    },
    imageData: {
      type: String,
      required: false // Make it optional for now
    }
  },
  {
    timestamps: true
  }
);

CheckinSchema.index({ employeeId: 1, timestamp: -1 });

export default mongoose.models.Checkin || mongoose.model<ICheckin>('Checkin', CheckinSchema);