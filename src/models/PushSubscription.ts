import mongoose from 'mongoose';

const PushSubscriptionSchema = new mongoose.Schema(
  {
    employeeId: { type: String, index: true, required: true },
    subscription: { type: Object, required: true }, // endpoint + keys
  },
  { timestamps: true }
);

// Enforce unique endpoint to avoid duplicates
PushSubscriptionSchema.index({ 'subscription.endpoint': 1 }, { unique: true });

export default mongoose.models.PushSubscription
  || mongoose.model('PushSubscription', PushSubscriptionSchema);
