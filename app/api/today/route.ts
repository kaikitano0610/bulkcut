import { NextResponse } from "next/server";
import { getDaySummary } from "@/lib/db";
import { todayJST } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const summary = await getDaySummary(todayJST());
  return NextResponse.json(summary);
}
