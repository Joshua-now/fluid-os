import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, unauthorizedResponse } from "@/lib/authGuard";

const N8N_BASE = process.env.N8N_BASE_URL ?? "https://n8n-production-5955.up.railway.app";
const N8N_KEY  = process.env.N8N_API_KEY ?? "";

const REPLY_POLLER_ID       = "C9YowwYlqUnOONzm";
const CAMPAIGN_LAUNCHER_ID  = "zEi7SAHjGuYoWp6S";
const DAILY_LEAD_MACHINE_ID = "bebmN61usKuNwkNE";

const SERVICES = [
  { label: "n8n",         url: `${N8N_BASE}/healthz` },
  { label: "Switchboard", url: "https://switchboard-v5-production.up.railway.app/health" },
];

async function getLastRun(wfId: string): Promise<{ minutesAgo: number | null; status: string }> {
  try {
    const res = await fetch(`${N8N_BASE}/api/v1/executions?workflowId=${wfId}&limit=1`, {
      headers: { "X-N8N-API-KEY": N8N_KEY },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    const data = await res.json();
    const execs = Array.isArray(data.data) ? data.data : [];
    if (execs.length === 0) return { minutesAgo: null, status: "never" };
    const last = execs[0];
    const minutesAgo = Math.floor((Date.now() - new Date(last.startedAt).getTime()) / 60000);
    return { minutesAgo, status: last.status ?? "unknown" };
  } catch {
    return { minutesAgo: null, status: "error" };
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthenticated(req)) return unauthorizedResponse();

  const [serviceResults, rpRun, clRun, lmRun] = await Promise.all([
    Promise.all(
      SERVICES.map(async (svc) => {
        try {
          const res = await fetch(svc.url, {
            signal: AbortSignal.timeout(5000),
            cache: "no-store",
          });
          return { label: svc.label, status: res.status < 500 ? "online" : "offline" };
        } catch {
          return { label: svc.label, status: "offline" };
        }
      })
    ),
    getLastRun(REPLY_POLLER_ID),
    getLastRun(CAMPAIGN_LAUNCHER_ID),
    getLastRun(DAILY_LEAD_MACHINE_ID),
  ]);

  // Reply Poller: stale if last run > 22 min ago
  const rpStatus = rpRun.minutesAgo === null
    ? "unknown"
    : rpRun.minutesAgo > 22
      ? "offline"
      : "online";

  // Campaign Launcher: stale if last run > 26 hours (should run once at 7AM)
  const clStatus = clRun.minutesAgo === null
    ? "unknown"
    : clRun.minutesAgo > 26 * 60
      ? "offline"
      : "online";

  // Lead Machine: stale if last run > 26 hours
  const lmStatus = lmRun.minutesAgo === null
    ? "unknown"
    : lmRun.minutesAgo > 26 * 60
      ? "offline"
      : "online";

  function label(run: { minutesAgo: number | null; status: string }) {
    if (run.minutesAgo === null) return "no data";
    if (run.minutesAgo < 60) return `${run.minutesAgo}m ago`;
    const h = Math.floor(run.minutesAgo / 60);
    return `${h}h ago`;
  }

  return NextResponse.json([
    ...serviceResults,
    { label: "Reply Poller", status: rpStatus,  detail: label(rpRun) },
    { label: "Campaign Launcher", status: clStatus, detail: label(clRun) },
    { label: "Lead Machine", status: lmStatus,  detail: label(lmRun) },
  ]);
}
