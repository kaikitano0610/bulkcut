import { NextRequest, NextResponse } from "next/server";
import { setPhase } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.kind) {
    return NextResponse.json({ error: "kind is required" }, { status: 400 });
  }

  const phase = await setPhase({
    kind: body.kind,
    targetWeightKg: body.target_weight_kg ?? null,
    paceKgPerWeek: body.pace_kg_per_week ?? null,
  });
  return NextResponse.json(phase);
}
