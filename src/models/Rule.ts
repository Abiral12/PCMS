import mongoose from 'mongoose';

const RuleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.Rule || mongoose.model('Rule', RuleSchema);
