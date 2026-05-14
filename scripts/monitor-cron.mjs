/**
 * Harbor Monitor Cron Runner
 * Railway Cron Job command: node scripts/monitor-cron.mjs
 * Schedule: every 10 minutes -> cron expression: "*/10 * * * *"
 *
 * Required env vars on the cron job service:
 *   SELF_URL        = https://fluid-os.aiteammate.io
 *   MONITOR_SECRET  = (same secret set on fluid-os service)
 */

const SELF_URL = process.env.SELF_URL || "https://fluid-os.aiteammate.io";
const SECRET   = process.env.MONITOR_SECRET || "";

async function run() {
  const url = `${SELF_URL}/api/harbor/monitor`;
  const headers = { "Content-Type": "application/json" };
  if (SECRET) headers["x-monitor-secret"] = SECRET;

  console.log(`[Harbor Monitor] ${new Date().toISOString()} — checking all systems`);
  try {
    const res = await fetch(url, { method: "POST", headers, signal: AbortSignal.timeout(55000) });
    const data = await res.json();
    console.log(`[Harbor Monitor] Healthy: ${data.healthy}`);
    if (data.fixed?.length)  console.log("  Auto-fixed:", data.fixed.join(" | "));
    if (data.issues?.length) console.log("  Issues:", data.issues.join(" | "));
    process.exit(0);
  } catch (err) {
    console.error("[Harbor Monitor] ERROR:", err.message);
    process.exit(1);
  }
}

run();
