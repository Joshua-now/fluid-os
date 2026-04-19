"use client";

import { useEffect, useMemo, useState, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
type LinkItem = { name: string; url: string };
type Section  = { title: string; icon: string; description: string; items: LinkItem[] };
type ServiceStatus = "checking" | "online" | "offline" | "unknown";
type LiveStatus = Record<string, ServiceStatus>;
type LiveDetail = Record<string, string>;

// ─── Campaign Health Types ────────────────────────────────────────────────────
type CampaignHealth = {
  id: string;
  name: string;
  status: number;
  statusLabel: string;
  sent: number;
  bounced: number;
  replied: number;
  bounceRate: number;
  replyRate: number;
  isCritical: boolean;
};

type AccountHealth = {
  email: string;
  status: string;
  warmupScore: number | null;
  dailyLimit: number | null;
  sentToday: number;
};

type HealthReport = {
  timestamp: string;
  campaigns: CampaignHealth[];
  accounts: AccountHealth[];
  summary: {
    totalCampaigns: number;
    activeCampaigns: number;
    pausedCampaigns: number;
    bouncePaused: number;
    criticalCount: number;
    avgBounceRate: number;
    totalSent: number;
    totalReplied: number;
  };
  hasAlerts: boolean;
};

// ─── Your real stack ──────────────────────────────────────────────────────────
const DEFAULT_SECTIONS: Section[] = [
  {
    title: "CRM & Pipeline",
    icon: "📈",
    description: "Leads, conversations, pipeline",
    items: [
      { name: "GoHighLevel",  url: "https://app.gohighlevel.com" },
      { name: "Conversations", url: "https://app.gohighlevel.com/v2/location/zkyEC4YPpQXczjPrdoPb/conversations/conversations/TC4tfZ3i0Av9Xkbwj9Ip" },
      { name: "Pipeline",     url: "https://app.gohighlevel.com/v2/location/zkyEC4YPpQXczjPrdoPb/opportunities/pipeline" },
      { name: "Contacts",     url: "https://app.gohighlevel.com/v2/location/zkyEC4YPpQXczjPrdoPb/contacts/smart_list/All" },
    ],
  },
  {
    title: "Email Outreach",
    icon: "📧",
    description: "Instantly campaigns & accounts",
    items: [
      { name: "Instantly",      url: "https://app.instantly.ai" },
      { name: "Campaigns",      url: "https://app.instantly.ai/app/campaigns" },
      { name: "Email Accounts", url: "https://app.instantly.ai/app/accounts" },
      { name: "Analytics",      url: "https://app.instantly.ai/app/analytics/overview" },
    ],
  },
  {
    title: "Automation",
    icon: "🤖",
    description: "n8n workflows & executions",
    items: [
      { name: "n8n Dashboard",     url: "https://n8n-production-5955.up.railway.app" },
      { name: "All Workflows",     url: "https://n8n-production-5955.up.railway.app/workflows" },
      { name: "Executions",        url: "https://n8n-production-5955.up.railway.app/executions" },
      { name: "Reply Handler",     url: "https://n8n-production-5955.up.railway.app/workflow/lFm6wiwlgOalsqRr" },
      { name: "Pipeline Watchdog", url: "https://n8n-production-5955.up.railway.app/workflow/OFs1lBWxOw6QOlaW" },
      { name: "Campaign Launcher", url: "https://n8n-production-5955.up.railway.app/workflow/zEi7SAHjGuYoWp6S" },
    ],
  },
  {
    title: "AI Calling",
    icon: "📞",
    description: "Telnyx, Switchboard, bots",
    items: [
      { name: "Telnyx Portal",         url: "https://portal.telnyx.com" },
      { name: "Switchboard V5",        url: "https://switchboard-v5-production.up.railway.app" },
      { name: "Anna (Speed to Lead)",  url: "https://portal.telnyx.com/#/ai/assistants/edit/assistant-76aa79cf-b607-4642-89d9-ce8142d7d21d" },
      { name: "Maya (After Hours)",    url: "https://portal.telnyx.com/#/ai/assistants/edit/assistant-5b358ddc-9166-4f69-b6ea-ac75a0df4fee" },
    ],
  },
  {
    title: "Infrastructure",
    icon: "🚂",
    description: "Hosting, deployments, code",
    items: [
      { name: "Railway",          url: "https://railway.app/dashboard" },
      { name: "GitHub",           url: "https://github.com/Joshua-now" },
      { name: "SwitchBoard Repo", url: "https://github.com/Joshua-now/SwitchBoard-V5" },
    ],
  },
  {
    title: "Comms & Monitoring",
    icon: "💬",
    description: "Slack alerts, logs, reporting",
    items: [
      { name: "Slack",                      url: "https://app.slack.com" },
      { name: "Telegram",                   url: "https://web.telegram.org" },
      { name: "#all-bobs-house (Main)",     url: "https://app.slack.com/client/T0ALH7F9G/C0AK3FTS3QF" },
      { name: "#ai-command-center (Alerts)",url: "https://app.slack.com/client/T0ALH7F9G/C0ALD81NG1E" },
    ],
  },
  {
    title: "Demos & Client Pages",
    icon: "🌐",
    description: "Your live product pages",
    items: [
      { name: "Speed to Lead Demo", url: "https://speed-to-lead.aiteammate.io" },
      { name: "After Hours Demo",   url: "https://after-hours.aiteammate.io" },
    ],
  },
];

// Labels for the health check display (actual checks run server-side via /api/health)
const HEALTH_LABELS = ["n8n", "Switchboard", "Reply Poller", "Campaign Launcher", "Lead Machine"];

// Instantly campaign health webhook
const INSTANTLY_HEALTH_URL = "https://n8n-production-5955.up.railway.app/webhook/instantly-health";

const STORAGE = {
  sections:  "fluid-os-sections",
  favorites: "fluid-os-favorites",
};

function itemKey(i: LinkItem) { return i.name + "||" + i.url; }

// ─── Status dot ───────────────────────────────────────────────────────────────
function Dot({ status }: { status: ServiceStatus }) {
  const colors: Record<ServiceStatus, string> = {
    checking: "bg-yellow-400 animate-pulse",
    online:   "bg-green-400",
    offline:  "bg-red-500",
    unknown:  "bg-zinc-500",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]}`} />;
}

// ─── Bounce rate gauge ────────────────────────────────────────────────────────
function BounceGauge({ rate }: { rate: number }) {
  const color = rate > 5 ? "bg-red-500" : rate > 3 ? "bg-yellow-500" : "bg-green-500";
  const width  = Math.min(rate * 10, 100);
  return (
    <div className="w-full bg-zinc-700 rounded-full h-1.5 mt-1">
      <div
        className={`h-1.5 rounded-full transition-all ${color}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

// ─── Campaign Health Monitor ──────────────────────────────────────────────────
function CampaignHealthMonitor() {
  const [report,    setReport]    = useState<HealthReport | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<string>("");

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(INSTANTLY_HEALTH_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: HealthReport = await res.json();
      setReport(data);
      setError(null);
      setLastFetch(
        new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const t = setInterval(fetchHealth, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [fetchHealth]);

  if (loading && !report) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">📊</span>
          <h2 className="font-semibold text-sm">Campaign Health</h2>
          <span className="text-xs text-yellow-400 animate-pulse ml-auto">Loading...</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-zinc-800 rounded-lg h-16 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="bg-zinc-900 border border-red-900/50 rounded-xl p-5">
        <div className="flex items-center gap-2">
          <span className="text-lg">📊</span>
          <h2 className="font-semibold text-sm">Campaign Health</h2>
          <span className="text-xs text-red-400 ml-auto">{error}</span>
          <button onClick={fetchHealth} className="text-xs text-zinc-400 hover:text-white ml-2 transition-colors">↻</button>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const { summary, campaigns, accounts } = report;

  return (
    <div className={`bg-zinc-900 border ${report.hasAlerts ? "border-red-800" : "border-zinc-800"} rounded-xl p-5 space-y-4`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📊</span>
          <h2 className="font-semibold text-sm">Campaign Health</h2>
          {report.hasAlerts && (
            <span className="text-xs bg-red-900/50 text-red-400 border border-red-800 px-2 py-0.5 rounded-full animate-pulse">
              ⚠ Alert
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastFetch && <span className="text-xs text-zinc-600">{lastFetch}</span>}
          <button
            onClick={fetchHealth}
            className="text-zinc-500 hover:text-white text-sm transition-colors"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Summary gauges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-zinc-800 rounded-xl p-3">
          <div className="text-xs text-zinc-500 mb-1">Active</div>
          <div className="text-2xl font-bold text-green-400">{summary.activeCampaigns}</div>
          <div className="text-xs text-zinc-600">of {summary.totalCampaigns} total</div>
        </div>
        <div className={`bg-zinc-800 rounded-xl p-3 ${summary.bouncePaused > 0 ? "ring-1 ring-red-800" : ""}`}>
          <div className="text-xs text-zinc-500 mb-1">Bounce-Paused</div>
          <div className={`text-2xl font-bold ${summary.bouncePaused > 0 ? "text-red-400" : "text-zinc-300"}`}>
            {summary.bouncePaused}
          </div>
          <div className="text-xs text-zinc-600">campaigns</div>
        </div>
        <div className="bg-zinc-800 rounded-xl p-3">
          <div className="text-xs text-zinc-500 mb-1">Avg Bounce</div>
          <div className={`text-2xl font-bold ${
            summary.avgBounceRate > 5 ? "text-red-400" :
            summary.avgBounceRate > 3 ? "text-yellow-400" : "text-green-400"
          }`}>
            {summary.avgBounceRate}%
          </div>
          <div className="text-xs text-zinc-600">7-day rate</div>
        </div>
        <div className="bg-zinc-800 rounded-xl p-3">
          <div className="text-xs text-zinc-500 mb-1">Total Sent</div>
          <div className="text-2xl font-bold text-zinc-200">{summary.totalSent.toLocaleString()}</div>
          <div className="text-xs text-zinc-600">last 7 days</div>
        </div>
      </div>

      {/* Per-campaign rows */}
      {campaigns.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">Campaigns</div>
          <div className="space-y-2">
            {campaigns.map((c) => (
              <div
                key={c.id}
                className={`flex items-start gap-3 px-3 py-2.5 rounded-xl ${
                  c.isCritical
                    ? "bg-red-950/30 ring-1 ring-red-900/50"
                    : "bg-zinc-800"
                }`}
              >
                <div className="mt-1.5 shrink-0">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    c.status === 1 ? "bg-green-400" :
                    c.status === 5 ? "bg-red-500 animate-pulse" :
                    c.status === 2 ? "bg-yellow-500" : "bg-zinc-500"
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-zinc-200 truncate">{c.name}</span>
                    <span className={`text-xs shrink-0 capitalize ${
                      c.status === 5 ? "text-red-400 font-semibold" :
                      c.status === 1 ? "text-green-400" : "text-zinc-500"
                    }`}>
                      {c.statusLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">Bounce rate</span>
                        <span className={`text-xs font-mono ${
                          c.bounceRate > 5 ? "text-red-400" :
                          c.bounceRate > 3 ? "text-yellow-400" : "text-zinc-400"
                        }`}>
                          {c.bounceRate}%
                        </span>
                      </div>
                      <BounceGauge rate={c.bounceRate} />
                    </div>
                    <div className="text-xs text-zinc-600 shrink-0 text-right">
                      <div>{c.sent.toLocaleString()} sent</div>
                      <div>{c.replied} replied</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mailbox statuses */}
      {accounts.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">Mailboxes</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {accounts.map((a) => (
              <div key={a.email} className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2">
                <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                  String(a.status) === "1" || a.status === "active"   ? "bg-green-400" :
                  String(a.status) === "2" || a.status === "paused"   ? "bg-yellow-500" :
                  "bg-zinc-500"
                }`} />
                <span className="text-xs text-zinc-300 truncate flex-1">{a.email}</span>
                <span className="text-xs text-zinc-600 shrink-0">
                  {a.sentToday}/{a.dailyLimit ?? "?"} today
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────
function EditModal({
  section,
  onSave,
  onCancel,
}: {
  section: Section;
  onSave: (s: Section) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Section>(JSON.parse(JSON.stringify(section)));

  const updateItem = (i: number, field: keyof LinkItem, value: string) => {
    const items = draft.items.map((item, idx) =>
      idx === i ? { ...item, [field]: value } : item
    );
    setDraft({ ...draft, items });
  };
  const removeItem = (i: number) => setDraft({ ...draft, items: draft.items.filter((_, idx) => idx !== i) });
  const addItem    = () => setDraft({ ...draft, items: [...draft.items, { name: "", url: "https://" }] });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <h2 className="font-semibold text-lg">{section.icon} {section.title}</h2>
          <button onClick={onCancel} className="text-zinc-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          {draft.items.map((item, i) => (
            <div key={i} className="flex gap-2 items-start">
              <div className="flex-1 space-y-1">
                <input
                  value={item.name}
                  onChange={(e) => updateItem(i, "name", e.target.value)}
                  placeholder="Name"
                  className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm border border-zinc-700 focus:border-blue-500 outline-none"
                />
                <input
                  value={item.url}
                  onChange={(e) => updateItem(i, "url", e.target.value)}
                  placeholder="URL"
                  className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm border border-zinc-700 focus:border-blue-500 outline-none font-mono"
                />
              </div>
              <button
                onClick={() => removeItem(i)}
                className="mt-2 text-zinc-500 hover:text-red-400 text-lg leading-none px-1"
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={addItem}
            className="w-full py-2 rounded-lg border border-dashed border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-white text-sm transition-colors"
          >
            + Add link
          </button>
        </div>
        <div className="flex gap-3 p-5 border-t border-zinc-800">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(draft)}
            className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function FluidOS() {
  const [sections,  setSections]  = useState<Section[]>(DEFAULT_SECTIONS);
  const [favorites, setFavorites] = useState<LinkItem[]>([]);
  const [search,    setSearch]    = useState("");
  const [editing,   setEditing]   = useState<Section | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>({});
  const [liveDetail, setLiveDetail] = useState<LiveDetail>({});
  const [lastChecked, setLastChecked] = useState<string>("");

  // ── Load from localStorage ──
  useEffect(() => {
    try {
      const s = localStorage.getItem(STORAGE.sections);
      const f = localStorage.getItem(STORAGE.favorites);
      if (s) setSections(JSON.parse(s));
      if (f) setFavorites(JSON.parse(f));
    } catch (_) {}
  }, []);

  // ── Persist ──
  useEffect(() => { localStorage.setItem(STORAGE.sections,  JSON.stringify(sections));  }, [sections]);
  useEffect(() => { localStorage.setItem(STORAGE.favorites, JSON.stringify(favorites)); }, [favorites]);

  // ── Live health checks (proxied server-side to avoid CORS) ──
  const checkHealth = useCallback(async () => {
    const checking: LiveStatus = {};
    for (const label of HEALTH_LABELS) checking[label] = "checking";
    setLiveStatus({ ...checking });

    try {
      const res  = await fetch("/api/health", { cache: "no-store" });
      const data: { label: string; status: "online" | "offline"; detail?: string }[] = await res.json();
      const next: LiveStatus = {};
      const det:  LiveDetail = {};
      for (const item of data) {
        next[item.label] = item.status;
        if (item.detail) det[item.label] = item.detail;
      }
      setLiveStatus(next);
      setLiveDetail(det);
    } catch {
      const failed: LiveStatus = {};
      for (const label of HEALTH_LABELS) failed[label] = "offline";
      setLiveStatus(failed);
    }
    setLastChecked(
      new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    );
  }, []);

  useEffect(() => {
    checkHealth();
    const t = setInterval(checkHealth, 60_000);
    return () => clearInterval(t);
  }, [checkHealth]);

  // ── Favorites ──
  const toggleFavorite = (item: LinkItem) => {
    const key = itemKey(item);
    setFavorites((prev) =>
      prev.find((f) => itemKey(f) === key)
        ? prev.filter((f) => itemKey(f) !== key)
        : [...prev, item]
    );
  };
  const isFav = (item: LinkItem) => !!favorites.find((f) => itemKey(f) === itemKey(item));

  // ── Sections CRUD ──
  const saveSection = (updated: Section) => {
    setSections((prev) => prev.map((s) => (s.title === updated.title ? updated : s)));
    setEditing(null);
  };

  // ── Search filter ──
  const filtered = useMemo(() => {
    if (!search.trim()) return sections;
    const q = search.toLowerCase();
    return sections
      .map((s) => ({ ...s, items: s.items.filter((i) => i.name.toLowerCase().includes(q)) }))
      .filter((s) => s.items.length > 0);
  }, [search, sections]);

  const now      = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {/* ── TOP BAR ── */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between sticky top-0 bg-zinc-950/95 backdrop-blur z-40">
        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold tracking-tight">
            <span className="text-white">Fluid</span>
            <span className="text-blue-400">OS</span>
          </div>
          <span className="text-zinc-500 text-sm hidden sm:block">
            {greeting}, Joshua
          </span>
        </div>

        {/* Live status indicators — top bar shows services only */}
        <div className="flex items-center gap-4">
          <a
            href="/vault"
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-zinc-800"
          >
            <span>🔐</span>
            <span className="hidden sm:inline">Vault</span>
          </a>
          {["n8n", "Switchboard"].map((label) => (
            <div key={label} className="flex items-center gap-1.5 text-xs text-zinc-400">
              <Dot status={liveStatus[label] ?? "unknown"} />
              <span className="hidden sm:inline">{label}</span>
            </div>
          ))}
          <button
            onClick={checkHealth}
            title="Refresh status"
            className="text-zinc-500 hover:text-white transition-colors text-sm"
          >
            ↻{lastChecked && <span className="ml-1 hidden sm:inline text-xs">{lastChecked}</span>}
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* ── SEARCH ── */}
        <input
          placeholder="Search tools..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-sm focus:border-blue-500 outline-none placeholder:text-zinc-600 transition-colors"
        />

        {/* ── FAVORITES ── */}
        {favorites.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">
              ⭐ Quick Access
            </h2>
            <div className="flex flex-wrap gap-2">
              {favorites.map((f) => (
                <a
                  key={itemKey(f)}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-500 rounded-lg text-sm font-medium transition-all"
                >
                  {f.name}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* ── LIVE STATUS BANNER ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {HEALTH_LABELS.map((label) => {
            const s   = liveStatus[label] ?? "unknown";
            const det = liveDetail[label];
            return (
              <div
                key={label}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3"
              >
                <Dot status={s} />
                <div className="min-w-0">
                  <div className="text-xs text-zinc-500 truncate">{label}</div>
                  <div className={`text-sm font-medium capitalize ${
                    s === "online"   ? "text-green-400"  :
                    s === "offline"  ? "text-red-400"    :
                    s === "checking" ? "text-yellow-400" : "text-zinc-400"
                  }`}>
                    {det ?? s}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── CAMPAIGN HEALTH MONITOR ── */}
        <CampaignHealthMonitor />

        {/* ── SECTIONS GRID ── */}
        {filtered.length === 0 ? (
          <p className="text-zinc-500 text-center py-12">No tools match &quot;{search}&quot;</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((section) => (
              <div
                key={section.title}
                className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-5 transition-colors"
              >
                {/* Section header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-lg">{section.icon}</span>
                      <h2 className="font-semibold text-sm">{section.title}</h2>
                    </div>
                    <p className="text-xs text-zinc-500">{section.description}</p>
                  </div>
                  <button
                    onClick={() => setEditing(section)}
                    className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors px-2 py-1 rounded hover:bg-zinc-800"
                  >
                    Edit
                  </button>
                </div>

                {/* Links */}
                <div className="space-y-1">
                  {section.items.map((item) => (
                    <div
                      key={itemKey(item)}
                      className="flex items-center justify-between group rounded-lg px-2 py-1.5 hover:bg-zinc-800 transition-colors"
                    >
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-zinc-300 group-hover:text-white transition-colors flex-1 truncate"
                      >
                        {item.name}
                      </a>
                      <button
                        onClick={() => toggleFavorite(item)}
                        className={`ml-2 text-sm transition-colors ${
                          isFav(item) ? "text-yellow-400" : "text-zinc-600 opacity-0 group-hover:opacity-100"
                        }`}
                        title={isFav(item) ? "Remove from quick access" : "Add to quick access"}
                      >
                        {isFav(item) ? "★" : "☆"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-zinc-700 pb-4">
          Fluid OS · Built for Joshua Brown · Fluid Productions, Orlando FL
        </p>
      </div>

      {/* ── EDIT MODAL ── */}
      {editing && (
        <EditModal
          section={editing}
          onSave={saveSection}
          onCancel={() => setEditing(null)}
        />
      )}
    </main>
  );
}
