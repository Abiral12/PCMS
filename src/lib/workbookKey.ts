// src/lib/workbookKey.ts
import mongoose from "mongoose";
import type { NextRequest } from "next/server";

export function ymdInTZ(tz: string, d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // already YYYY-MM-DD
}

export function getEmployeeObjectId(req: NextRequest, bodyEmpId?: unknown) {
  const raw =
    req.headers.get("x-employee-id") ||
    req.headers.get("x-user-id") ||
    (typeof bodyEmpId === "string" ? bodyEmpId : "") ||
    "";

  if (!raw) return null;
  if (!mongoose.Types.ObjectId.isValid(raw)) return null;
  return new mongoose.Types.ObjectId(raw);
}
