/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
/**
 * Harbor Autonomous Monitor
 * GET/POST /api/harbor/monitor
 *
 * Runs every 10 minutes via Railway cron.
 * Checks every connected system, auto-fixes what it can,
 * sends Slack alert + optional phone call for what it can't.
 */

import { NextRequest, NextResponse } from "next/server";
import { executeTool } from "@/lib/harbor/brain";

const MONITOR_SECRET = process.env.MONITOR_SECRET || "";
const JOSHUA_PHONE   = process.env.JOSHUA_PHONE || "";
const SLACK_ALERT_CHANNEL = process.env.SLACK_ALERT_CHANNEL || process.env.SLACK_HAND_RAISES_CHANNEL || "";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function slackAlert(message: string) {
  if (!SLACK_ALERT_CHANNEL) return;
  await executeTool("send_slack_message", {
    channel: SLACK_ALERT_CHANNEL,
    message: `🚨 *Harbor Monitor Alert*\n${message}`,
  }).catch(() => {});
}

async function callJoshua(message: string) {
  if (!JOSHUA_PHONE) return;
  await executeTool("make_outbound_call", {
    phone_number: JOSHUA_PHONE,
    contact_name: "Joshua",
    message,
  }).catch(() => {});
}

// ─── Individual system checks ─────────────────────────────────────────────────

async function checkN8N() {
  const result = await executeTool("check_n8n", {}).catch((e: any) => ({ ok: false, error: e.message }));
  const issues: string[] = [];
  const fixed: string[] = [];

  if (!result.ok) {
    issues.push(`n8n unreachable: ${result.error}`);
    return { issues, fixed };
  }

  // Report what was auto-restarted
  for (const r of result.auto_restarted || []) {
    if (r.restarted) fixed.push(`Restarted n8n workflow: "${r.name}"`);
    else issues.push(`Failed to restart "${r.name}": ${r.error}`);
  }

  // Flag recent failures
  for (const f of result.recent_failures || []) {
    issues.push(`n8n workflow "${f.workflow}" failed at ${f.at}: ${f.error}`);
  }

  return { issues, fixed, raw: result };
}

async function checkInstantly() {
  const result = await executeTool("check_instantly", {}).catch((e: any) => ({ found: false, error: e.message }));
  const issues: string[] = [];
  const fixed: string[] = [];

  if (!result.found) {
    issues.push(`Instantly unreachable or no campaigns found: ${result.error || "no data"}`);
    return { issues, fixed };
  }

  for (const c of result.campaigns || []) {
    const statusLower = (c.status || "").toString().toLowerCase();
    // Auto-resume paused campaigns
    if (statusLower === "paused" || c.status === 2) {
      const res = await executeTool("toggle_campaign", { campaign_name: c.name, action: "resume" }).catch((e: any) => ({ success: false, error: e.message }));
      if (res.success) fixed.push(`Resumed Instantly campaign: "${c.name}"`);
      else issues.push(`Could not resume campaign "${c.name}": ${res.error}`);
    }
    // Flag campaigns with zero activity
    if (c.sent === 0 && statusLower !== "paused") {
      issues.push(`Campaign "${c.name}" is active but has sent 0 emails — check sending accounts`);
    }
  }

  return { issues, fixed, raw: result };
}

async function checkSwitchboard() {
  const result = await executeTool("check_switchboard", {}).catch((e: any) => ({ ok: false, error: e.message }));
  const issues: string[] = [];
  if (!result.ok) issues.push(`Switchboard offline: ${result.error}`);
  return { issues, fixed: [], raw: result };
}

async function checkSlack() {
  const result = await executeTool("check_slack", {}).catch((e: any) => ({ ok: false, error: e.message }));
  const issues: string[] = [];
  if (!result.ok) issues.push(`Slack integration broken: ${result.error}`);
  return { issues, fixed: [], raw: result };
}

async function checkGuardian() {
  const result = await executeTool("check_guardian_sentinel", {}).catch((e: any) => ({ found: false, error: e.message }));
  const issues: string[] = [];

  if (!result.found) {
    issues.push(`Guardian/Sentinel not running: ${result.error || "no recent executions found"}`);
    return { issues, fixed: [] };
  }

  // If last success was more than 30 minutes ago, flag it
  if (result.last_success && result.last_success !== "None found") {
    const lastRun = new Date(result.last_success).getTime();
    const minutesAgo = Math.round((Date.now() - lastRun) / 60000);
    if (minutesAgo > 30) {
      issues.push(`Guardian/Sentinel last ran ${minutesAgo} minutes ago — may be stuck`);
    }
  } else if (result.last_success === "None found") {
    issues.push("Guardian/Sentinel has no successful runs — check n8n workflows");
  }

  return { issues, fixed: [], raw: result };
}

async function checkRailway() {
  const result = await executeTool("check_railway", {}).catch((e: any) => ({ services: [] }));
  const issues: string[] = [];

  for (const svc of result.services || []) {
    if (svc.status === "offline") {
      issues.push(`Railway service "${svc.name}" is OFFLINE (${svc.error})`);
    }
  }

  return { issues, fixed: [], raw: result };
}

// ─── Main monitor run ─────────────────────────────────────────────────────────

async function runMonitor() {
  const startedAt = new Date().toISOString();
  const allFixed: string[] = [];
  const allIssues: string[] = [];

  const [n8n, instantly, switchboard, slack, guardian, railway] = await Promise.all([
    checkN8N(),
    checkInstantly(),
    checkSwitchboard(),
    checkSlack(),
    checkGuardian(),
    checkRailway(),
  ]);

  for (const r of [n8n, instantly, switchboard, slack, guardian, railway]) {
    allFixed.push(...(r.fixed || []));
    allIssues.push(...(r.issues || []));
  }

  const report = {
    checkedAt: startedAt,
    fixed: allFixed,
    issues: allIssues,
    healthy: allIssues.length === 0,
  };

  // Send Slack alert if anything is broken
  if (allIssues.length > 0) {
    const fixedLines = allFixed.length > 0
      ? `\n✅ *Auto-fixed:*\n${allFixed.map(f => `• ${f}`).join("\n")}`
      : "";
    const issueLines = `\n❌ *Needs attention:*\n${allIssues.map(i => `• ${i}`).join("\n")}`;
    const msg = `System check at ${new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York" })} ET${fixedLines}${issueLines}`;

    await slackAlert(msg);

    // Call Joshua if there are critical issues (offline services or n8n completely down)
    const critical = allIssues.some(i =>
      i.includes("offline") || i.includes("unreachable") || i.includes("Guardian/Sentinel not running")
    );
    if (critical && JOSHUA_PHONE) {
      const callMsg = `Harbor alert. ${allIssues.length} system issue${allIssues.length > 1 ? "s" : ""} need your attention. Check Slack for details.`;
      await callJoshua(callMsg);
    }
  }

  return report;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized triggers
  const secret = req.nextUrl.searchParams.get("secret") || req.headers.get("x-monitor-secret");
  if (MONITOR_SECRET && secret !== MONITOR_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const report = await runMonitor();
  return NextResponse.json(report);
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-monitor-secret");
  if (MONITOR_SECRET && secret !== MONITOR_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const report = await runMonitor();
  return NextResponse.json(report);
}
