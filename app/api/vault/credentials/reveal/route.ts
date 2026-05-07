import { NextRequest, NextResponse } from "next/server";
import { CREDENTIALS } from "@/lib/credentials";

export const dynamic = "force-dynamic";

// We import the runtimeValues store indirectly via the parent module's exports.
// Since Next.js runs in the same process, we keep a module-level map here too
// that the POST /credentials route also writes to. In production this resets on
// redeploy — that's expected. The primary source of truth is Railway env vars.

function isAuthed(req: NextRequest) {
  return req.cookies.get("vault_auth")?.value === "1";
}

// Maps credential id → the Railway env var name (if any) so we can read it back
function envVarForCred(id: string): string | null {
  const cred = CREDENTIALS.find((c) => c.id === id);
  if (!cred) return null;
  const railwayLoc = cred.locations.find((l) => l.type === "railway") as
    | { type: "railway"; varName: string }
    | undefined;
  return railwayLoc?.varName ?? null;
}

// GET /api/vault/credentials/reveal?id=<credId>
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const cred = CREDENTIALS.find((c) => c.id === id);
  if (!cred) return NextResponse.json({ error: "Unknown credential" }, { status: 404 });

  // 1. Try Railway env var on this service first (persists across restarts)
  const varName = envVarForCred(id);
  const envValue = varName ? process.env[varName] : null;

  if (envValue) {
    return NextResponse.json({ id, value: envValue, source: "env" });
  }

  // 2. No env var found — value must be rotated in manually
  return NextResponse.json(
    {
      id,
      value: null,
      source: "none",
      hint: varName
        ? `Set ${varName} as an environment variable on this Railway service to enable reveal.`
        : "This credential has no Railway env var — paste a new value using Rotate.",
    },
    { status: 404 }
  );
}
