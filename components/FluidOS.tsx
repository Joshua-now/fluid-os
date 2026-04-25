"use client";

import { useEffect, useMemo, useState, useCallback } from "react";

type LinkItem  = { name: string; url: string };
type Section   = { title: string; icon: string; description: string; items: LinkItem[] };
type ServiceStatus = "checking" | "online" | "offline" | "unknown";
type LiveStatus = Record<string, ServiceStatus>;
type LiveDetail = Record<string, string>;

interface InstantlyCampaign {
  id: string; name: string; status: string;
  dailyLimit?: number; openRate?: number; bounceRate?: number; replyRate?: number; sentCount?: number;
}
interface InstantlyMailbox {
  id: string; email: string; status: string;
  warmupEnabled?: boolean; dailyLimit?: number; sentToday?: number;
}
interface InstantlySnapshot {
  campaigns: InstantlyCampaign[]; mailboxes: InstantlyMailbox[]; fetchedAt: string; error?: string;
}
interface OptimizeResult {
  runAt: string; campaignsChecked: number; mailboxesChecked: number;
  actions: { campaignName: string; action: string; reason: string; applied: boolean }[];
  summary: string; error?: string;
}

const DEFAULT_SECTIONS: Section[] = [
  {
    title: "CRM & Pipeline", icon: "📈", description: "Leads, conversations, pipeline",
    items: [
      { name: "GoHighLevel",       url: "https://app.gohighlevel.com" },
      { name: "Conversations",     url: "https://app.gohighlevel.com/v2/location/zkyEC4YPpQXczjPrdoPb/conversations/conversations/TC4tfZ3i0Av9Xkbwj9Ip" },
      { name: "Pipeline",          url: "https://app.gohighlevel.com/v2/location/zkyEC4YPpQXczjPrdoPb/opportunities/pipeline" },
      { name: "Contacts",          url: "https://app.gohighlevel.com/v2/location/zkyEC4YPpQXczjPrdoPb/contacts/smart_list/All" },
    ],
  },
  {
    title: "Email Outreach", icon: "📧", description: "Instantly campaigns & accounts",
    items: [
      { name: "Instantly",         url: "https://app.instantly.ai" },
      { name: "Campaigns",         url: "https://app.instantly.ai/app/campaigns" },
      { name: "Email Accounts",    url: "https://app.instantly.ai/app/accounts" },
      { name: "Analytics",         url: "https://app.instantly.ai/app/analytics/overview" },
    ],
  },
  {
    title: "Automation", icon: "🤖", description: "n8n workflows & executions",
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
    title: "AI Calling", icon: "📞", description: "Telnyx, Switchboard, bots",
    items: [
      { name: "Telnyx Portal",        url: "https://portal.telnyx.com" },
      { name: "Switchboard V5",       url: "https://switchboard-v5-production.up.railway.app" },
      { name: "Anna (Speed to Lead)", url: "https://portal.telnyx.com/#/ai/assistants/edit/assistant-76aa79cf-b607-4642-89d9-ce8142d7d21d" },
      { name: "Maya (After Hours)",   url: "https://portal.telnyx.com/#/ai/assistants/edit/assistant-5b358ddc-9166-4f69-b6ea-ac75a0df4fee" },
    ],
  },
  {
    title: "Infrastructure", icon: "🚂", description: "Hosting, deployments, code",
    items: [
      { name: "Railway",           url: "https://railway.app/dashboard" },
      { name: "GitHub",            url: "https://github.com/Joshua-now" },
      { name: "SwitchBoard Repo",  url: "https://github.com/Joshua-now/SwitchBoard-V5" },
    ],
  },
  {
    title: "Comms & Monitoring", icon: "💬", description: "Slack alerts, logs, reporting",
    items: [
      { name: "Slack",               url: "https://app.slack.com" },
      { name: "Telegram",            url: "https://web.telegram.org" },
      { name: "#all-bobs-house (Main)", url: "https://app.slack.com/client/T0ALH7F9G/C0AK3FTS3QF" },
      { name: "#ai-command-center (Alerts)", url: "https://app.slack.com/client/T0ALH7F9G/C0ALD81NG1E" },
    ],
  },
  {
    title: "Demos & Client Pages", icon: "🌐", description: "Your live product pages",
    items: [
      { name: "Speed to Lead Demo", url: "https://speed-to-lead.aiteammate.io" },
      { name: "After Hours Demo",   url: "https://after-hours.aiteammate.io" },
    ],
  },
];

const HEALTH_LABELS = ["n8n", "Switchboard", "Reply Poller", "Campaign Launcher", "Lead Machine"];
const STORAGE = { sections: "fluid-os-sections", favorites: "fluid-os-favorites" };
function itemKey(i: LinkItem) { return i.name + "||" + i.url; }

function Dot({ status }: { status: ServiceStatus }) {
  const colors: Record<ServiceStatus, string> = {
    checking: "bg-yellow-400 animate-pulse", online: "bg-green-400",
    offline: "bg-red-500", unknown: "bg-zinc-500",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]}`} />;
}

function EditModal({ section, onSave, onCancel }: { section: Section; onSave: (s: Section) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<Section>(JSON.parse(JSON.stringify(section)));
  const updateItem = (i: number, field: keyof LinkItem, value: string) => {
    const items = draft.items.map((item, idx) => idx === i ? { ...item, [field]: value } : item);
    setDraft({ ...draft, items });
  };
  const removeItem = (i: number) => setDraft({ ...draft, items: draft.items.filter((_, idx) => idx !== i) });
  const addItem = () => setDraft({ ...draft, items: [...draft.items, { name: "", url: "https://" }] });
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <h2 className="font-semibold text-lg">{section.icon} {section.title}</h2>
          <button onClick={onCancel} className="text-zinc-400 hover:text-white text-xl leading-none">x</button>
        </div>
        <div className="p-5 space-y-3">
          {draft.items.map((item, i) => (
            <div key={i} className="flex gap-2 items-start">
              <div className="flex-1 space-y-1">
                <input value={item.name} onChange={(e) => updateItem(i, "name", e.target.value)} placeholder="Name"
                  className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm border border-zinc-700 focus:border-blue-500 outline-none" />
                <input value={item.url} onChange={(e) => updateItem(i, "url", e.target.value)} placeholder="URL"
                  className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm border border-zinc-700 focus:border-blue-500 outline-none font-mono" />
              </div>
              <button onClick={() => removeItem(i)} className="mt-2 text-zinc-500 hover:text-red-400 text-lg leading-none px-1">x</button>
            </div>
          ))}
          <button onClick={addItem} className="w-full py-2 rounded-lg border border-dashed border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-white text-sm transition-colors">
            + Add link
          </button>
        </div>
        <div className="flex gap-3 p-5 border-t border-zinc-800">
          <button onClick={onCancel} className="flex-1 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors">Cancel</button>
          <button onClick={() => onSave(draft)} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition-colors">Save</button>
        </div>
      </div>
    </div>
  );
}

function Gauge({ value, label, good, warn }: { value: number; label: string; good: number; warn: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = value >= good ? "text-green-400 stroke-green-400" : value >= warn ? "text-yellow-400 stroke-yellow-400" : "text-red-400 stroke-red-400";
  const r = 28; const circ = 2 * Math.PI * r; const dash = (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="72" height="72" viewBox="0 0 72 72" className="rotate-[-90deg]">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#27272a" strokeWidth="8" />
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="8" strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" className={color} />
      </svg>
      <div className={`text-lg font-bold -mt-12 ${color.split(" ")[0]}`}>{value}%</div>
      <div className="mt-8 text-xs text-zinc-500 text-center">{label}</div>
    </div>
  );
}

function InstantlyPanel() {
  const [snapshot, setSnapshot]     = useState<InstantlySnapshot | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [lastOpt, setLastOpt]       = useState<OptimizeResult | null>(null);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState(false);

  const fetchSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/instantly", { cache: "no-store" });
      setSnapshot(await res.json());
    } catch {
      setSnapshot({ campaigns: [], mailboxes: [], fetchedAt: new Date().toISOString(), error: "Fetch failed" });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSnapshot();
    const t = setInterval(fetchSnapshot, 2 * 60 * 1000);
    return () => clearInterval(t);
  }, [fetchSnapshot]);

  const runOptimizer = async () => {
    setOptimizing(true);
    try {
      const res = await fetch("/api/instantly/optimize", { method: "POST", cache: "no-store" });
      setLastOpt(await res.json());
      await fetchSnapshot();
    } catch {
      setLastOpt({ runAt: new Date().toISOString(), campaignsChecked: 0, mailboxesChecked: 0, actions: [], summary: "Optimizer call failed", error: "Network error" });
    }
    setOptimizing(false);
  };

  const avg = (key: keyof InstantlyCampaign) =>
    snapshot?.campaigns.length ? Math.round(snapshot.campaigns.reduce((s, c) => s + ((c[key] as number) ?? 0), 0) / snapshot.campaigns.length) : 0;

  const avgOpenRate   = avg("openRate");
  const avgBounceRate = avg("bounceRate");
  const avgReplyRate  = avg("replyRate");
  const healthyMailboxes = snapshot?.mailboxes.filter((m) => m.status === "active" || m.status === "connected").length ?? 0;
  const totalMailboxes   = snapshot?.mailboxes.length ?? 0;
  const statusColor = (s: string) => s === "active" || s === "running" ? "text-green-400" : s === "paused" ? "text-yellow-400" : "text-red-400";

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">📧</span>
            <h2 className="font-semibold text-sm">Instantly Monitor</h2>
            {snapshot?.error && <span className="text-xs text-red-400 bg-red-400/10 px-2 py-0.5 rounded">API Error</span>}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            {loading ? "Loading..." : `${snapshot?.campaigns.length ?? 0} campaigns · ${totalMailboxes} mailboxes`}
            {snapshot?.fetchedAt && !loading && (
              <span className="ml-2 text-zinc-600">· {new Date(snapshot.fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchSnapshot} disabled={loading} className="text-zinc-500 hover:text-white transition-colors text-sm disabled:opacity-40" title="Refresh">↻</button>
          <button onClick={runOptimizer} disabled={optimizing}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg text-xs font-semibold transition-colors">
            {optimizing ? "Optimizing..." : "Run Optimizer"}
          </button>
        </div>
      </div>

      {!loading && !snapshot?.error && (
        <div className="flex justify-around py-2">
          <Gauge value={avgOpenRate}   label="Open Rate"   good={30} warn={20} />
          <Gauge value={avgReplyRate}  label="Reply Rate"  good={10} warn={5}  />
          <div className="flex flex-col items-center gap-1">
            <svg width="72" height="72" viewBox="0 0 72 72" className="rotate-[-90deg]">
              <circle cx="36" cy="36" r={28} fill="none" stroke="#27272a" strokeWidth="8" />
              <circle cx="36" cy="36" r={28} fill="none" strokeWidth="8"
                strokeDasharray={`${Math.min(100, avgBounceRate) / 100 * 2 * Math.PI * 28} ${2 * Math.PI * 28}`}
                strokeLinecap="round"
                className={avgBounceRate < 3 ? "stroke-green-400" : avgBounceRate < 5 ? "stroke-yellow-400" : "stroke-red-400"} />
            </svg>
            <div className={`text-lg font-bold -mt-12 ${avgBounceRate < 3 ? "text-green-400" : avgBounceRate < 5 ? "text-yellow-400" : "text-red-400"}`}>{avgBounceRate}%</div>
            <div className="mt-8 text-xs text-zinc-500">Bounce Rate</div>
          </div>
          <div className="flex flex-col items-center justify-center gap-1 text-center">
            <div className={`text-2xl font-bold ${healthyMailboxes === totalMailboxes && totalMailboxes > 0 ? "text-green-400" : "text-yellow-400"}`}>
              {healthyMailboxes}/{totalMailboxes}
            </div>
            <div className="text-xs text-zinc-500">Mailboxes<br/>Healthy</div>
          </div>
        </div>
      )}

      {snapshot?.error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-xs text-red-300">{snapshot.error}</div>
      )}

      {lastOpt && (
        <div className={`rounded-lg px-4 py-3 text-xs border ${lastOpt.error ? "bg-red-500/10 border-red-500/30 text-red-300" : "bg-zinc-800 border-zinc-700 text-zinc-300"}`}>
          <div className="font-semibold mb-1">Optimizer · {new Date(lastOpt.runAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
          <div>{lastOpt.summary}</div>
          {lastOpt.actions.length > 0 && (
            <ul className="mt-2 space-y-1">
              {lastOpt.actions.slice(0, 5).map((a, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span>{a.applied ? "+" : "-"}</span>
                  <span><span className="font-medium">{a.campaignName}:</span> {a.reason}</span>
                </li>
              ))}
              {lastOpt.actions.length > 5 && <li className="text-zinc-500">+{lastOpt.actions.length - 5} more actions</li>}
            </ul>
          )}
        </div>
      )}

      {!loading && !snapshot?.error && (snapshot?.campaigns.length ?? 0) > 0 && (
        <div>
          <button onClick={() => setExpanded((v) => !v)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            {expanded ? "^ Hide" : "v Show"} campaigns ({snapshot!.campaigns.length})
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {snapshot!.campaigns.map((c) => (
                <div key={c.id} className="flex items-center justify-between bg-zinc-800 rounded-lg px-3 py-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className={`capitalize ${statusColor(c.status)}`}>{c.status}</div>
                  </div>
                  <div className="flex gap-4 text-zinc-400 ml-4 shrink-0">
                    <span title="Open rate">O {c.openRate ?? 0}%</span>
                    <span title="Reply rate">R {c.replyRate ?? 0}%</span>
                    <span title="Bounce rate" className={c.bounceRate && c.bounceRate >= 5 ? "text-red-400" : ""}>B {c.bounceRate ?? 0}%</span>
                    {c.dailyLimit && <span title="Daily limit">{c.dailyLimit}/d</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function FluidOS() {
  const [sections,    setSections]    = useState<Section[]>(DEFAULT_SECTIONS);
  const [favorites,   setFavorites]   = useState<LinkItem[]>([]);
  const [search,      setSearch]      = useState("");
  const [editing,     setEditing]     = useState<Section | null>(null);
  const [liveStatus,  setLiveStatus]  = useState<LiveStatus>({});
  const [liveDetail,  setLiveDetail]  = useState<LiveDetail>({});
  const [lastChecked, setLastChecked] = useState<string>("");

  useEffect(() => {
    try {
      const s = localStorage.getItem(STORAGE.sections);
      const f = localStorage.getItem(STORAGE.favorites);
      if (s) setSections(JSON.parse(s));
      if (f) setFavorites(JSON.parse(f));
    } catch (_) {}
  }, []);

  useEffect(() => { localStorage.setItem(STORAGE.sections, JSON.stringify(sections)); }, [sections]);
  useEffect(() => { localStorage.setItem(STORAGE.favorites, JSON.stringify(favorites)); }, [favorites]);

  const checkHealth = useCallback(async () => {
    const checking: LiveStatus = {};
    for (const label of HEALTH_LABELS) checking[label] = "checking";
    setLiveStatus({ ...checking });
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const data: { label: string; status: "online" | "offline"; detail?: string }[] = await res.json();
      const next: LiveStatus = {}; const det: LiveDetail = {};
      for (const item of data) { next[item.label] = item.status; if (item.detail) det[item.label] = item.detail; }
      setLiveStatus(next); setLiveDetail(det);
    } catch {
      const failed: LiveStatus = {};
      for (const label of HEALTH_LABELS) failed[label] = "offline";
      setLiveStatus(failed);
    }
    setLastChecked(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
  }, []);

  useEffect(() => { checkHealth(); const t = setInterval(checkHealth, 60000); return () => clearInterval(t); }, [checkHealth]);

  const toggleFavorite = (item: LinkItem) => {
    const key = itemKey(item);
    setFavorites((prev) => prev.find((f) => itemKey(f) === key) ? prev.filter((f) => itemKey(f) !== key) : [...prev, item]);
  };
  const isFav = (item: LinkItem) => !!favorites.find((f) => itemKey(f) === itemKey(item));
  const saveSection = (updated: Section) => { setSections((prev) => prev.map((s) => (s.title === updated.title ? updated : s))); setEditing(null); };

  const filtered = useMemo(() => {
    if (!search.trim()) return sections;
    const q = search.toLowerCase();
    return sections.map((s) => ({ ...s, items: s.items.filter((i) => i.name.toLowerCase().includes(q)) })).filter((s) => s.items.length > 0);
  }, [search, sections]);

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between sticky top-0 bg-zinc-950/95 backdrop-blur z-40">
        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold tracking-tight">
            <span className="text-white">Fluid</span><span className="text-blue-400">OS</span>
          </div>
          <span className="text-zinc-500 text-sm hidden sm:block">{greeting}, Joshua</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/metrics" className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-zinc-800">
            <span>📊</span><span className="hidden sm:inline">Metrics</span>
          </a>
          <a href="/vault" className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-zinc-800">
            <span>🔐</span><span className="hidden sm:inline">Vault</span>
          </a>
          <a href="/facebook" className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-zinc-800">
            <span>📘</span><span className="hidden sm:inline">Facebook</span>
          </a>
          {["n8n", "Switchboard"].map((label) => (
            <div key={label} className="flex items-center gap-1.5 text-xs text-zinc-400">
              <Dot status={liveStatus[label] ?? "unknown"} /><span className="hidden sm:inline">{label}</span>
            </div>
          ))}
          <button onClick={checkHealth} title="Refresh status" className="text-zinc-500 hover:text-white transition-colors text-sm">
            ↻{lastChecked && <span className="ml-1 hidden sm:inline text-xs">{lastChecked}</span>}
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        <input placeholder="Search tools..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-sm focus:border-blue-500 outline-none placeholder:text-zinc-600 transition-colors" />

        {favorites.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">⭐ Quick Access</h2>
            <div className="flex flex-wrap gap-2">
              {favorites.map((f) => (
                <a key={itemKey(f)} href={f.url} target="_blank" rel="noreferrer"
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-500 rounded-lg text-sm font-medium transition-all">
                  {f.name}
                </a>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {HEALTH_LABELS.map((label) => {
            const s = liveStatus[label] ?? "unknown"; const det = liveDetail[label];
            return (
              <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3">
                <Dot status={s} />
                <div className="min-w-0">
                  <div className="text-xs text-zinc-500 truncate">{label}</div>
                  <div className={`text-sm font-medium capitalize ${s === "online" ? "text-green-400" : s === "offline" ? "text-red-400" : s === "checking" ? "text-yellow-400" : "text-zinc-400"}`}>
                    {det ?? s}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <InstantlyPanel />

        {filtered.length === 0 ? (
          <p className="text-zinc-500 text-center py-12">No tools match &quot;{search}&quot;</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((section) => (
              <div key={section.title} className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-5 transition-colors">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-lg">{section.icon}</span>
                      <h2 className="font-semibold text-sm">{section.title}</h2>
                    </div>
                    <p className="text-xs text-zinc-500">{section.description}</p>
                  </div>
                  <button onClick={() => setEditing(section)} className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors px-2 py-1 rounded hover:bg-zinc-800">Edit</button>
                </div>
                <div className="space-y-1">
                  {section.items.map((item) => (
                    <div key={itemKey(item)} className="flex items-center justify-between group rounded-lg px-2 py-1.5 hover:bg-zinc-800 transition-colors">
                      <a href={item.url} target="_blank" rel="noreferrer" className="text-sm text-zinc-300 group-hover:text-white transition-colors flex-1 truncate">{item.name}</a>
                      <button onClick={() => toggleFavorite(item)}
                        className={`ml-2 text-sm transition-colors ${isFav(item) ? "text-yellow-400" : "text-zinc-600 opacity-0 group-hover:opacity-100"}`}
                        title={isFav(item) ? "Remove from quick access" : "Add to quick access"}>
                        {isFav(item) ? "★" : "☆"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-zinc-700 pb-4">Fluid OS · Built for Joshua Brown · Fluid Productions, Orlando FL</p>
      </div>

      {editing && <EditModal section={editing} onSave={saveSection} onCancel={() => setEditing(null)} />}
    </main>
  );
}
