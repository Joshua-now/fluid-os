import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Debug only — reveals nothing sensitive, just confirms env var state
  const val = process.env.VAULT_PASSWORD;
  return NextResponse.json({
    envSet: !!val,
    envLength: val?.trim().length ?? 0,
    fallback: !val,
  });
}

export async function POST(req: NextRequest) {
  const VAULT_PASSWORD = (process.env.VAULT_PASSWORD ?? "fluid2024").trim();
  const { password } = await req.json();

  if (password.trim() !== VAULT_PASSWORD) {
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
