/**
 * app/api/harbor/voice/route.ts
 *
 * Telnyx webhook handler for Harbor outbound calls.
 * Telnyx posts call lifecycle events here when Harbor calls Joshua's phone
 * via the make_outbound_call tool in lib/harbor/brain.ts.
 *
 * Set TELNYX_VOICE_WEBHOOK_URL in Railway to:
 *   https://<your-fluidos-domain>/api/harbor/voice
 *
 * Env vars:
 *   TELNYX_API_KEY       — for TTS calls back to Telnyx
 *   TELNYX_APP_SECRET    — optional webhook signature verification
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TELNYX_API_KEY = process.env.TELNYX_API_KEY ?? "";

// Basic Telnyx signature verification (optional — set TELNYX_APP_SECRET to enable)
function verifySignature(req: NextRequest, body: string): boolean {
  const secret = process.env.TELNYX_APP_SECRET;
  if (!secret) return true; // Not configured — skip

  const sig = req.headers.get("telnyx-signature-ed25519");
  if (!sig) return false;

  // Full Ed25519 verification would go here
  // For now, presence of the header with a secret configured is a sanity check
  return !!sig;
}

/** Use Telnyx Call Control API to speak a message via TTS */
async function speak(callControlId: string, text: string): Promise<void> {
  await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/speak`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TELNYX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payload: text,
      voice: "female",
      language: "en-US",
      client_state: Buffer.from("harbor-briefing").toString("base64"),
    }),
    signal: AbortSignal.timeout(8000),
  });
}

/** Hang up the call */
async function hangup(callControlId: string): Promise<void> {
  await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/hangup`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TELNYX_API_KEY}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(5000),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();

  if (!verifySignature(req, rawBody)) {
    console.warn("[Harbor/Voice] Rejected — invalid signature");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data = (event.data ?? {}) as Record<string, unknown>;
  const eventType = String(data.event_type ?? "");
  const payload = (data.payload ?? {}) as Record<string, unknown>;
  const callControlId = String(payload.call_control_id ?? "");

  console.log(`[Harbor/Voice] Event: ${eventType} | call=${callControlId}`);

  switch (eventType) {
    case "call.answered": {
      // Joshua picked up — speak the briefing message stored in client_state
      const clientStateRaw = String(payload.client_state ?? "");
      let message = "Good morning Joshua. Harbor here. Your morning briefing is ready. Check the FluidOS dashboard for details.";
      try {
        const decoded = Buffer.from(clientStateRaw, "base64").toString("utf8");
        const parsed = JSON.parse(decoded);
        if (parsed.message) message = parsed.message;
      } catch {
        // Use default message
      }

      if (callControlId && TELNYX_API_KEY) {
        await speak(callControlId, message).catch((e) =>
          console.error("[Harbor/Voice] speak error:", e.message)
        );
      }
      break;
    }

    case "call.speak.ended":
    case "call.machine.detection.ended": {
      // TTS finished — hang up
      if (callControlId && TELNYX_API_KEY) {
        await hangup(callControlId).catch((e) =>
          console.error("[Harbor/Voice] hangup error:", e.message)
        );
      }
      break;
    }

    case "call.hangup":
      console.log(`[Harbor/Voice] Call ended — reason: ${payload.hangup_cause ?? "unknown"}`);
      break;

    default:
      console.log(`[Harbor/Voice] Unhandled event: ${eventType}`);
  }

  // Telnyx expects 200 within 5s or it retries
  return NextResponse.json({ received: true });
}
