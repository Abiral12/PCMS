import mongoose, { Schema, Document, Types } from "mongoose";

export type PayFrequency = "monthly" | "weekly" | "daily" | "hourly";

export interface SalaryHistoryItem {
  amount: number;
  currency: string;
  frequency: PayFrequency;
  effectiveFrom: Date;
  note?: string;
}

export interface IEmployeeSalary extends Document {
  employeeId: Types.ObjectId; // reference to Employee _id
  amount: number;
  currency: string;
  frequency: PayFrequency;
  effectiveFrom: Date;
  history: SalaryHistoryItem[];
  updatedAt: Date;
  createdAt: Date;
}

const SalaryHistorySchema = new Schema<SalaryHistoryItem>(
  {
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "NPR", trim: true },
    frequency: {
      type: String,
      required: true,
      enum: ["monthly", "weekly", "daily", "hourly"],
      default: "monthly",
    },
    effectiveFrom: { type: Date, required: true },
    note: { type: String, trim: true },
  },
  { _id: false }
);

const EmployeeSalarySchema = new Schema<IEmployeeSalary>(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      unique: true, // ✅ one salary record per employee
      index: true,
    },

    // Current salary (fast reads)
    amount: { type: Number, required: true, min: 0, default: 0 },
    currency: { type: String, required: true, default: "NPR", trim: true },
    frequency: {
      type: String,
      required: true,
      enum: ["monthly", "weekly", "daily", "hourly"],
      default: "monthly",
    },
    effectiveFrom: { type: Date, required: true, default: Date.now },

    // History
    history: { type: [SalaryHistorySchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.EmployeeSalary ||
  mongoose.model<IEmployeeSalary>("EmployeeSalary", EmployeeSalarySchema);
