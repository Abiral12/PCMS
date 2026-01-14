// models/WorkbookDay.ts
import mongoose, { Schema, model, models } from "mongoose";

const SlotSchema = new Schema(
  {
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    text: { type: String, default: "" },
  },
  { _id: false }
);

const SessionSchema = new Schema(
  {
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, default: null },
    slots: { type: [SlotSchema], default: [] },
  },
  { _id: false }
);

const TodoSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    done: { type: Boolean, default: false },
    createdAt: { type: String, required: true },
  },
  { _id: false }
);

const WorkbookDaySchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    todos: { type: [TodoSchema], default: [] },
    sessions: { type: [SessionSchema], default: [] },
    notes: { type: String, default: "" },

    // ✅ NEW: explicit completion gate
    isSubmitted: { type: Boolean, default: false, index: true },
    submittedAt: { type: Date, default: null },

    hourly: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

WorkbookDaySchema.index({ employeeId: 1, date: 1 }, { unique: true });

export default models.WorkbookDay || model("WorkbookDay", WorkbookDaySchema);
