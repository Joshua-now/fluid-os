import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

const VAULT_PASSWORD = process.env.VAULT_PASSWORD ?? "";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const provided = String(body?.password ?? "").trim();

  // Timing-safe comparison — prevents brute-force timing attacks
  const expBuf  = Buffer.from(VAULT_PASSWORD);
  const provBuf = Buffer.from(provided);
  const matches = VAULT_PASSWORD.length > 0
    && provBuf.length === expBuf.length
    && timingSafeEqual(provBuf, expBuf);

  if (!matches) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("vault_auth", "1", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8 hours
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("vault_auth", "", { maxAge: 0, path: "/" });
  return res;
}
