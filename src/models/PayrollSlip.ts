import mongoose, { Schema } from "mongoose";

const PayrollSlipSchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },

    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    baseSalary: { type: Number, required: true },
    cycleDays: { type: Number, required: true },
    perDay: { type: Number, required: true },

    absentDays: { type: Number, required: true },
    absentDeduction: { type: Number, required: true },

    advancesApplied: [
      {
        advanceId: { type: Schema.Types.ObjectId, ref: "PayrollAdvance" },
        amount: { type: Number, required: true },
      },
    ],
    advancesTotal: { type: Number, required: true },

    otherAdjustment: { type: Number, default: 0 }, // bonus or manual deduction
    netPay: { type: Number, required: true },

    status: { type: String, enum: ["draft", "paid"], default: "draft" },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.PayrollSlip ||
  mongoose.model("PayrollSlip", PayrollSlipSchema);
