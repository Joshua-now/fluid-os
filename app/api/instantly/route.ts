import { NextResponse } from "next/server";

const INSTANTLY_BASE = "https://api.instantly.ai/api/v2";

function getAuthHeader(): string {
return `Bearer ${process.env.INSTANTLY_API_KEY ?? ""}`;
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

export interface Campaign {
  id: string;
  name: string;
  status: string;
  dailyLimit?: number;
  openRate?: number;
  bounceRate?: number;
  replyRate?: number;
  sentCount?: number;
  openCount?: number;
  replyCount?: number;
  bounceCount?: number;
}

export interface Mailbox {
  id: string;
  email: string;
  status: string;
  warmupEnabled?: boolean;
  dailyLimit?: number;
  sentToday?: number;
}

export interface InstantlySnapshot {
  campaigns: Campaign[];
  mailboxes: Mailbox[];
  fetchedAt: string;
  error?: string;
}

export async function GET(): Promise<NextResponse> {
  try {
    const [campaignsRaw, accountsRaw] = await Promise.all([
      instantly<{ items?: unknown[]; data?: unknown[] }>("/campaigns?limit=50&status=all"),
      instantly<{ items?: unknown[]; data?: unknown[] }>("/accounts?limit=100"),
    ]);

    const campaignList = (campaignsRaw.items ?? campaignsRaw.data ?? []) as Record<string, unknown>[];
    const accountList  = (accountsRaw.items ?? accountsRaw.data ?? []) as Record<string, unknown>[];

    const activeCampaigns = campaignList.slice(0, 10);
    const analyticsResults = await Promise.allSettled(
      activeCampaigns.map((c) =>
        instantly<Record<string, unknown>>(`/campaigns/${c.id}/analytics`)
      )
    );

    const campaigns: Campaign[] = activeCampaigns.map((c, i) => {
      const analytics = analyticsResults[i].status === "fulfilled"
        ? (analyticsResults[i] as PromiseFulfilledResult<Record<string, unknown>>).value
        : {};
      const sent   = Number(analytics.total_sent   ?? c.total_sent   ?? 0);
      const opens  = Number(analytics.total_opened ?? c.total_opened ?? 0);
      const replies= Number(analytics.total_replied?? c.total_replied?? 0);
      const bounces= Number(analytics.total_bounced?? c.total_bounced?? 0);
      return {
        id:          String(c.id ?? ""),
        name:        String(c.name ?? "Unnamed"),
        status:      String(c.status ?? "unknown"),
        dailyLimit:  Number(c.daily_limit ?? c.dailyLimit ?? 0),
        sentCount:   sent,
        openCount:   opens,
        replyCount:  replies,
        bounceCount: bounces,
        openRate:    sent > 0 ? Math.round((opens   / sent) * 100) : 0,
        replyRate:   sent > 0 ? Math.round((replies / sent) * 100) : 0,
        bounceRate:  sent > 0 ? Math.round((bounces / sent) * 100) : 0,
      };
    });

    const mailboxes: Mailbox[] = accountList.map((a) => ({
      id:             String(a.id ?? ""),
      email:          String(a.email ?? ""),
      status:         String(a.status ?? "unknown"),
      warmupEnabled:  Boolean(a.warmup_enabled ?? a.warmupEnabled ?? false),
      dailyLimit:     Number(a.daily_limit ?? a.dailyLimit ?? 0),
      sentToday:      Number(a.sent_today ?? a.sentToday ?? 0),
    }));

    const snapshot: InstantlySnapshot = {
      campaigns,
      mailboxes,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { campaigns: [], mailboxes: [], fetchedAt: new Date().toISOString(), error: message },
      { status: 200 }
    );
  }
}
