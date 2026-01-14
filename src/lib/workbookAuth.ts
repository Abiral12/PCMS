import { NextRequest } from "next/server";
import { Types } from "mongoose";

export function getEmployeeObjectId(req: NextRequest) {
  const raw = req.headers.get("x-employee-id");
  if (!raw) throw new Error("Missing x-employee-id");
  if (!Types.ObjectId.isValid(raw)) throw new Error("Invalid employee id");
  return new Types.ObjectId(raw);
}

export function isValidYMD(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}
