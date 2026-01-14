import mongoose, { Schema, models, model } from "mongoose";

const DeductionEntrySchema = new Schema(
  {
    date: { type: Date, required: true },     // applies on this date (used to filter month/range)
    reason: { type: String, default: "" },
    amount: { type: Number, required: true }, // NPR
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const SalaryProfileSchema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      unique: true,
      required: true,
    },

    // supports both monthly and hourly (your payroll preview expects this)
    payType: {
      type: String,
      enum: ["monthly", "hourly"],
      default: "monthly",
    },

    // monthly
    baseMonthly: { type: Number, default: 0 },

    // hourly + overtime
    hourlyRate: { type: Number, default: 0 },
    overtimeRate: { type: Number, default: 0 },
    standardHoursPerDay: { type: Number, default: 8 },

    // optional additions (you already had these fields in API)
    allowances: { type: Number, default: 0 },

    // NEW: salary activation date
    effectiveFrom: { type: Date, required: true },

    // NEW: deductions ledger
    deductions: { type: [DeductionEntrySchema], default: [] },

    notes: { type: String, default: "" },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// keep one profile per employee
SalaryProfileSchema.index({ employeeId: 1 }, { unique: true });

export default models.SalaryProfile || model("SalaryProfile", SalaryProfileSchema);
