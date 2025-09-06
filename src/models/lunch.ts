import mongoose, { Schema, Document } from 'mongoose';

export interface ILunchTime extends Document {
  employeeId: mongoose.Types.ObjectId;
  employeeName: string;
  startTime: string; // Format: "HH:MM"
  endTime: string;   // Format: "HH:MM"
  days: string[];    // e.g., ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
  createdAt: Date;
  updatedAt: Date;
}

const LunchTimeSchema: Schema = new Schema({
  employeeId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Employee',
    required: true 
  },
  employeeName: {
    type: String,
    required: true
  },
  startTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ // Validates HH:MM format
  },
  endTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ // Validates HH:MM format
  },
  days: [{
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    required: true
  }]
}, {
  timestamps: true
});

// Create a compound index to ensure one lunch time per employee
LunchTimeSchema.index({ employeeId: 1 }, { unique: true });

export default mongoose.models.LunchTime || mongoose.model<ILunchTime>('LunchTime', LunchTimeSchema);