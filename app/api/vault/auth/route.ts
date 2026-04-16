import { NextRequest, NextResponse } from "next/server";

const VAULT_PASSWORD = process.env.VAULT_PASSWORD ?? "fluid2024";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (password !== VAULT_PASSWORD) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("vault_auth", "1", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8 hours
    path: "/vault",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("vault_auth");
  return res;
}
