import { NextResponse } from "next/server";
import { CREDENTIALS, daysUntilExpiry } from "@/lib/credentials";

export const dynamic = "force-dynamic";

// Public endpoint — returns expiry info only, no key values
export async function GET() {
  const items = CREDENTIALS
    .map((c) => {
      const days = daysUntilExpiry(c.expiresAt);
      return {
        id: c.id,
        name: c.name,
        service: c.service,
        expiresAt: c.expiresAt,
        daysRemaining: days,
      };
    })
    .filter((c) => c.daysRemaining !== null); // only include keys with known expiry

  return NextResponse.json(items);
}
