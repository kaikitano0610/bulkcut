import { NextRequest, NextResponse } from "next/server";
import { getProfileAndTargets, upsertProfile } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getProfileAndTargets();
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const profile = await upsertProfile({
    heightCm: body.height_cm,
    birthDate: body.birth_date,
    sex: body.sex,
    activityFactor: body.activity_factor,
    proteinPerKg: body.protein_per_kg,
    fatRatio: body.fat_ratio,
  });
  return NextResponse.json(profile);
}
