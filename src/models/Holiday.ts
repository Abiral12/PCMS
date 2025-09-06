import mongoose, { Schema, Document } from 'mongoose';

export interface IHoliday extends Document {
  date: Date;
  description?: string;
}

const HolidaySchema = new Schema<IHoliday>({
  date: { type: Date, required: true, unique: true },
  description: { type: String },
});

export default mongoose.models.Holiday || mongoose.model<IHoliday>('Holiday', HolidaySchema);
