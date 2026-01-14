import mongoose, { Schema } from "mongoose";

const PayrollAdvanceSchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    amount: { type: Number, required: true },
    note: { type: String, default: "" },

    status: { type: String, enum: ["open", "settled"], default: "open" },
    settledAt: { type: Date, default: null },

    createdBy: { type: String, default: "" }, // optional
  },
  { timestamps: true }
);

export default mongoose.models.PayrollAdvance ||
  mongoose.model("PayrollAdvance", PayrollAdvanceSchema);
