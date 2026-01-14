import mongoose, { Document, Schema } from "mongoose";

/* ===================== Types ===================== */

export type PayFrequency = "monthly" | "weekly" | "daily" | "hourly";

export type SalaryHistoryItem = {
  amount: number;          // store in NPR (or your chosen currency)
  currency: string;        // e.g. "NPR"
  frequency: PayFrequency; // e.g. "monthly"
  effectiveFrom: Date;     // when this salary started
  note?: string;
};

export interface IEmployee extends Document {
  name: string;
  email: string;
  passwordHash: string;
  department: string;
  role: string;
  position: string;

  isActive: boolean;
  isPaused: boolean;

  // Salary
  salary?: {
    amount: number;          // current salary amount
    currency: string;        // "NPR"
    frequency: PayFrequency; // "monthly" by default
    effectiveFrom: Date;     // date when current salary became effective
  };

  salaryHistory?: SalaryHistoryItem[];

  createdAt: Date;
  updatedAt: Date;
}

/* ===================== Schema ===================== */

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

const EmployeeSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },

    department: { type: String, required: true, default: "General" },
    role: { type: String, required: true, default: "Employee" },
    position: { type: String, required: true },

    isActive: { type: Boolean, default: true },
    isPaused: { type: Boolean, default: false },

    // Current salary (fast to read in UI)
    salary: {
      amount: { type: Number, min: 0, default: 0 },
      currency: { type: String, default: "NPR", trim: true },
      frequency: {
        type: String,
        enum: ["monthly", "weekly", "daily", "hourly"],
        default: "monthly",
      },
      effectiveFrom: { type: Date, default: Date.now },
    },

    // Optional history (for audits / payslip correctness)
    salaryHistory: { type: [SalaryHistorySchema], default: [] },
  },
  { timestamps: true }
);

/* ===================== Indexes ===================== */

EmployeeSchema.index({ email: 1 });
EmployeeSchema.index({ department: 1, role: 1 });
EmployeeSchema.index({ "salary.effectiveFrom": -1 });

export default mongoose.models.Employee ||
  mongoose.model<IEmployee>("Employee", EmployeeSchema);
