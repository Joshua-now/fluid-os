// DEPRECATED — Bob has been renamed Harbor.
// Use /api/harbor/status
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "This endpoint is deprecated. Use /api/harbor/status" },
    { status: 410 }
  );
}
