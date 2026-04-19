import { NextResponse } from "next/server";

const INSTANTLY_BASE = "https://api.instantly.ai/api/v2";

const RULES = {
  bounceCritical:    5,
  bounceWarning:     3,
  openRateMin:      20,
  openRateMinSent:  50,
  limitReductionCritical: 0.4,
  limitReductionWarning:  0.6,
  minDailyLimit:    10,
};

function getAuthHeader(): string {
  return "Bearer ${process.env.INSTANTLY_API_KEY ?? ""}";
}

async function instantly<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${INSTANTLY_BASE}${path}`, {
    ...options,
    headers: {
      "Authorization": getAuthHeader(),
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Instantly ${path} -> ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

interface OptimizeAction {
  campaignId: string;
  campaignName: string;
  action: string;
  reason: string;
  oldValue?: number;
  newValue?: number;
  applied: boolean;
  error?: string;
}

export interface OptimizeResult {
  runAt: string;
  campaignsChecked: number;
  mailboxesChecked: number;
  actions: OptimizeAction[];
  summary: string;
}

export async function POST(): Promise<NextResponse> {
  const actions: OptimizeAction[] = [];
  const runAt = new Date().toISOString();

  try {
    const campaignsRaw = await instantly<{ items?: unknown[]; data?: unknown[] }>("/campaigns?limit=50&status=all");
    const campaignList = (campaignsRaw.items ?? campaignsRaw.data ?? []) as Record<string, unknown>[];

    const analyticsResults = await Promise.allSettled(
      campaignList.map((c) =>
        instantly<Record<string, unknown>>(`/campaigns/${c.id}/analytics`)
      )
    );

    for (let i = 0; i < campaignList.length; i++) {
      const c = campaignList[i];
      const analytics = analyticsResults[i].status === "fulfilled"
        ? (analyticsResults[i] as PromiseFulfilledResult<Record<string, unknown>>).value
        : {};

      const campaignId   = String(c.id ?? "");
      const campaignName = String(c.name ?? "Unnamed");
      const currentLimit = Number(c.daily_limit ?? c.dailyLimit ?? 50);
      const sent   = Number(analytics.total_sent    ?? c.total_sent    ?? 0);
      const opens  = Number(analytics.total_opened  ?? c.total_opened  ?? 0);
      const bounces= Number(analytics.total_bounced ?? c.total_bounced ?? 0);

      const bounceRate = sent > 0 ? (bounces / sent) * 100 : 0;
      const openRate   = sent > 0 ? (opens   / sent) * 100 : 0;

      if (bounceRate >= RULES.bounceCritical) {
        const newLimit = Math.max(RULES.minDailyLimit, Math.round(currentLimit * RULES.limitReductionCritical));
        const action: OptimizeAction = {
          campaignId, campaignName,
          action: "reduce_daily_limit",
          reason: `Bounce rate ${bounceRate.toFixed(1)}% >= critical ${RULES.bounceCritical}%. Needs email verification.`,
          oldValue: currentLimit, newValue: newLimit, applied: false,
        };
        try {
          await instantly(`/campaigns/${campaignId}`, { method: "PATCH", body: JSON.stringify({ daily_limit: newLimit }) });
          action.applied = true;
        } catch (err) { action.error = err instanceof Error ? err.message : String(err); }
        actions.push(action);
        actions.push({ campaignId, campaignName, action: "flag_email_verification",
          reason: `High bounce rate (${bounceRate.toFixed(1)}%) - verify email list before resuming.`, applied: true });
      } else if (bounceRate >= RULES.bounceWarning) {
        const newLimit = Math.max(RULES.minDailyLimit, Math.round(currentLimit * RULES.limitReductionWarning));
        const action: OptimizeAction = {
          campaignId, campaignName,
          action: "reduce_daily_limit",
          reason: `Bounce rate ${bounceRate.toFixed(1)}% >= warning ${RULES.bounceWarning}%.`,
          oldValue: currentLimit, newValue: newLimit, applied: false,
        };
        try {
          await instantly(`/campaigns/${campaignId}`, { method: "PATCH", body: JSON.stringify({ daily_limit: newLimit }) });
          action.applied = true;
        } catch (err) { action.error = err instanceof Error ? err.message : String(err); }
        actions.push(action);
      }

      if (sent >= RULES.openRateMinSent && openRate < RULES.openRateMin) {
        actions.push({ campaignId, campaignName, action: "flag_low_open_rate",
          reason: `Open rate ${openRate.toFixed(1)}% < ${RULES.openRateMin}% over ${sent} sends. Check subject lines.`,
          applied: true });
      }
    }

    const accountsRaw = await instantly<{ items?: unknown[]; data?: unknown[] }>("/accounts?limit=100");
    const accountList  = (accountsRaw.items ?? accountsRaw.data ?? []) as Record<string, unknown>[];

    for (const a of accountList) {
      const status = String(a.status ?? "");
      if (status === "error" || status === "disconnected" || status === "suspended") {
        actions.push({ campaignId: "mailbox", campaignName: String(a.email ?? "unknown mailbox"),
          action: "flag_mailbox_error",
          reason: `Mailbox status: ${status}. Reconnect or replace this sending account.`, applied: true });
      }
    }

    const appliedCount = actions.filter((a) => a.applied).length;
    const summary = actions.length === 0
      ? "All campaigns healthy - no actions needed."
      : `${actions.length} issue(s) found, ${appliedCount} action(s) applied.`;

    return NextResponse.json({ runAt, campaignsChecked: campaignList.length,
      mailboxesChecked: accountList.length, actions, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { runAt, error: message, actions: [], campaignsChecked: 0, mailboxesChecked: 0, summary: `Error: ${message}` },
      { status: 200 }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return POST();
}
