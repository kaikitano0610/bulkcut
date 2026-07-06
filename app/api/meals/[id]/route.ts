import { NextRequest, NextResponse } from "next/server";
import { deleteMeal } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mealId = Number(id);
  if (!Number.isInteger(mealId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  await deleteMeal(mealId);
  return NextResponse.json({ deleted: true });
}
