import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import WorkbookDay from "@/models/WorkbookDay";
import { getEmployeeObjectId, isValidYMD } from "@/lib/workbookAuth";

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const employeeId = getEmployeeObjectId(req);
    const { date, id, text } = await req.json();

    if (!isValidYMD(date)) return NextResponse.json({ error: "date invalid" }, { status: 400 });
    if (!id || typeof id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });

    const t = String(text ?? "").trim();
    if (!t) return NextResponse.json({ error: "text required" }, { status: 400 });

    // Ensure day exists, push todo only if that id doesn't exist
    const day = await WorkbookDay.findOneAndUpdate(
      { employeeId, date, "todos.id": { $ne: id } },
      {
        $setOnInsert: { employeeId, date },
        $push: { todos: { id, text: t, done: false, createdAt: new Date() } },
      },
      { upsert: true, new: true }
    ).lean();

    return NextResponse.json({ ok: true, day });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await dbConnect();

    const employeeId = getEmployeeObjectId(req);
    const { date, id, text, done } = await req.json();

    if (!isValidYMD(date)) return NextResponse.json({ error: "date invalid" }, { status: 400 });
    if (!id || typeof id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });

    const set: Record<string, any> = {};
    if (typeof text === "string") set["todos.$[t].text"] = text.trim();
    if (typeof done === "boolean") set["todos.$[t].done"] = done;

    if (Object.keys(set).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const day = await WorkbookDay.findOneAndUpdate(
      { employeeId, date },
      { $set: set },
      { new: true, arrayFilters: [{ "t.id": id }] }
    ).lean();

    return NextResponse.json({ ok: true, day });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await dbConnect();

    const employeeId = getEmployeeObjectId(req);
    const { date, id } = await req.json();

    if (!isValidYMD(date)) return NextResponse.json({ error: "date invalid" }, { status: 400 });
    if (!id || typeof id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });

    const day = await WorkbookDay.findOneAndUpdate(
      { employeeId, date },
      { $pull: { todos: { id } } },
      { new: true }
    ).lean();

    return NextResponse.json({ ok: true, day });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
