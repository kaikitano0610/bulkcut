import "server-only";
import { jwtVerify, SignJWT } from "jose";

export const AUTH_COOKIE_NAME = "bulkcut_auth";
const COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // 90 days

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Missing required environment variable: AUTH_SECRET");
  return new TextEncoder().encode(secret);
}

export async function signAuthToken(): Promise<string> {
  return new SignJWT({ sub: "kitano" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${COOKIE_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyAuthToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecretKey());
    return true;
  } catch {
    return false;
  }
}

export const authCookieOptions = {
  httpOnly: true,
  // Secure cookies require HTTPS; disabled outside production so local http://localhost dev works.
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: COOKIE_MAX_AGE_SECONDS,
};

// Best-effort in-memory rate limiter. Resets when the serverless instance recycles;
// acceptable for a single-user hobby app per DESIGN.md §9.
const failuresByIp = new Map<string, { count: number; lockedUntil: number }>();
const MAX_FAILURES = 5;
const LOCK_MS = 10 * 60 * 1000;

export function isLoginLocked(ip: string): boolean {
  const entry = failuresByIp.get(ip);
  if (!entry) return false;
  if (entry.lockedUntil > Date.now()) return true;
  if (entry.lockedUntil !== 0 && entry.lockedUntil <= Date.now()) {
    failuresByIp.delete(ip);
  }
  return false;
}

export function recordLoginFailure(ip: string): void {
  const entry = failuresByIp.get(ip) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) {
    entry.lockedUntil = Date.now() + LOCK_MS;
  }
  failuresByIp.set(ip, entry);
}

export function clearLoginFailures(ip: string): void {
  failuresByIp.delete(ip);
}
