import mongoose, { Schema, Types } from "mongoose";

const PayrollProfileSchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", unique: true, required: true },

    baseSalary: { type: Number, required: true },        // e.g., 18200
    cycleDays: { type: Number, required: true },         // e.g., 24 (every 24 days)
    effectiveFrom: { type: Date, required: true },

    // Saturday exclusion = 6 if using JS Date.getDay() (Sun=0..Sat=6)
    excludeWeekdays: { type: [Number], default: [6] },

    // rounding strategy for perDay (because 18200/24 is fractional)
    perDayRounding: { type: String, enum: ["none", "floor", "round", "ceil"], default: "round" },

    // helps you compute next cycle start easily
    lastPaidThrough: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.PayrollProfile ||
  mongoose.model("PayrollProfile", PayrollProfileSchema);
