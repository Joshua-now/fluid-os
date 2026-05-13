/**
 * fluid-os/app/api/harbor/status/route.ts
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "online",
    name: "Harbor",
    version: "1.0.0",
    source: "fluid-os",
    tools: 25,
    timestamp: new Date().toISOString(),
  });
}
