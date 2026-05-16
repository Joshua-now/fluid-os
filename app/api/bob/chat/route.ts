// DEPRECATED — Bob has been renamed Harbor.
// All traffic is handled by /api/harbor/chat
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.text();
  return NextResponse.json(
    { error: "This endpoint is deprecated. Use /api/harbor/chat" },
    { status: 410, headers: { Location: "/api/harbor/chat" } }
  );
}
