// app/models/LunchLog.ts
import mongoose, { Schema, models, model } from 'mongoose';

const LunchLogSchema = new Schema({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  type: { type: String, enum: ['lunch-start', 'lunch-end'], required: true },
  timestamp: { type: Date, default: Date.now },
  imageData: { type: String }, // <- base64 data URL
});
export default models.LunchLog || model('LunchLog', LunchLogSchema);
