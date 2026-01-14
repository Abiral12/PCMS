import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import PayrollAdvance from "@/models/PayrollAdvance";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    await dbConnect();

    const id = ctx.params.id;
    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;

    if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });

    if (action === "settle") {
      const updated = await PayrollAdvance.findByIdAndUpdate(
        id,
        { $set: { status: "settled", settledAt: new Date() } },
        { new: true }
      ).lean();

      return NextResponse.json({ success: true, advance: updated });
    }

    if (action === "reopen") {
      const updated = await PayrollAdvance.findByIdAndUpdate(
        id,
        { $set: { status: "open", settledAt: null } },
        { new: true }
      ).lean();

      return NextResponse.json({ success: true, advance: updated });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to update advance" },
      { status: 500 }
    );
  }
}
