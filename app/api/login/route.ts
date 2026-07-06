import { NextRequest, NextResponse } from "next/server";
import { authCookieOptions, AUTH_COOKIE_NAME, clearLoginFailures, isLoginLocked, recordLoginFailure, signAuthToken } from "@/lib/auth";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  if (isLoginLocked(ip)) {
    return NextResponse.json({ error: "試行回数が多すぎます。しばらくしてから再試行してください。" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) {
    recordLoginFailure(ip);
    return NextResponse.json({ error: "パスワードが違います。" }, { status: 401 });
  }

  clearLoginFailures(ip);
  const token = await signAuthToken();

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions);
  return res;
}
