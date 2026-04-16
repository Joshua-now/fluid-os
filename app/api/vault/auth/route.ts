import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VAULT_PASSWORD = "FluidVault2026";

export async function POST(req: NextRequest) {
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
