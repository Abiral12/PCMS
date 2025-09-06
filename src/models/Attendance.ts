import mongoose from 'mongoose';

const AttendanceSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  type: {
    type: String,
    enum: ['checkin', 'checkout'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  imageData: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

export default mongoose.models.Attendance || mongoose.model('Attendance', AttendanceSchema);