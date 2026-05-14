import { NextResponse } from "next/server";
import axios from "axios";

async function ping(name: string, fn: () => Promise<void>): Promise<{ ok: boolean; ms: number; error?: string }> {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, ms: Date.now() - start };
  } catch (e: any) {
    return { ok: false, ms: Date.now() - start, error: e?.message?.slice(0, 80) };
  }
}

export async function GET() {
  const [slack, ghl, instantly, switchboard, n8n] = await Promise.all([

    // Slack — auth.test
    ping("slack", async () => {
      if (!process.env.SLACK_BOT_TOKEN) throw new Error("SLACK_BOT_TOKEN not set");
      const r = await axios.post(
        "https://slack.com/api/auth.test",
        {},
        { headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` }, timeout: 6000 }
      );
      if (!r.data?.ok) throw new Error(r.data?.error || "Slack auth failed");
    }),

    // GHL — fetch location info
    ping("ghl", async () => {
      if (!process.env.GHL_PIT_TOKEN || !process.env.GHL_LOCATION_ID) throw new Error("GHL env vars not set");
      await axios.get(
        `https://services.leadconnectorhq.com/locations/${process.env.GHL_LOCATION_ID}`,
        { headers: { Authorization: `Bearer ${process.env.GHL_PIT_TOKEN}`, Version: "2021-07-28" }, timeout: 6000 }
      );
    }),

    // Instantly — list campaigns
    ping("instantly", async () => {
      if (!process.env.INSTANTLY_API_KEY) throw new Error("INSTANTLY_API_KEY not set");
      await axios.get(
        "https://api.instantly.ai/api/v2/campaigns?limit=1",
        { headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}` }, timeout: 6000 }
      );
    }),

    // Switchboard — health endpoint
    ping("switchboard", async () => {
      if (!process.env.SWITCHBOARD_URL) throw new Error("SWITCHBOARD_URL not set");
      await axios.get(`${process.env.SWITCHBOARD_URL}/health`, {
        headers: process.env.SWITCHBOARD_API_KEY
          ? { Authorization: `Bearer ${process.env.SWITCHBOARD_API_KEY}` }
          : {},
        timeout: 6000,
      });
    }),

    // n8n — healthz
    ping("n8n", async () => {
      if (!process.env.N8N_BASE_URL) throw new Error("N8N_BASE_URL not set");
      await axios.get(`${process.env.N8N_BASE_URL}/healthz`, { timeout: 6000 });
    }),
  ]);

  return NextResponse.json({ slack, ghl, instantly, switchboard, n8n, timestamp: new Date().toISOString() });
}
