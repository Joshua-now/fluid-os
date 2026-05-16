/**
 * lib/authGuard.ts
 * Shared auth helpers for FluidOS API routes.
 *
 * All internal routes (health, metrics, instantly, harbor/chat) should
 * call isAuthenticated(req) and return 401 if false.
 *
 * Auth is established by POST /api/vault/auth → sets httpOnly vault_auth cookie.
 */
import { NextRequest, NextResponse } from "next/server";

export function isAuthenticated(req: NextRequest): boolean {
  return req.cookies.get("vault_auth")?.value === "1";
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
