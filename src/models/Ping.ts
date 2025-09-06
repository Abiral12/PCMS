import mongoose from 'mongoose';

const pingSchema = new mongoose.Schema({
  employeeId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const Ping = mongoose.models.Ping || mongoose.model('Ping', pingSchema);

export default Ping;
