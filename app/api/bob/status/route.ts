/**
 * fluid-os/app/api/bob/status/route.ts
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "online",
    name: "Bob",
    version: "2.0.0",
    source: "fluid-os",
    tools: 25,
    timestamp: new Date().toISOString(),
  });
}
