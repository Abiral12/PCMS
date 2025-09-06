import mongoose from 'mongoose';

const { Schema } = mongoose;

const BroadcastMessageSchema = new Schema(
  {
    subject: { type: String, required: true, trim: true },
    body:    { type: String, required: true, trim: true },
    urgent:  { type: Boolean, default: false },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },

    recipients: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
      }
    ],
  },
  { timestamps: true }
);

// IMPORTANT on Next.js/Vercel to avoid OverwriteModelError
export default mongoose.models.BroadcastMessage
  || mongoose.model('BroadcastMessage', BroadcastMessageSchema);
