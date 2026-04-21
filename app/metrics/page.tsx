"use client";

import { useCallback, useEffect, useState } from "react";

interface MetricsData {
  leads: { today: number; week: number; month: number };
  pipeline: Record<string, number>;
  totalValue: number;
  bookedCount: number;
  conversionRate: number;
  fetchedAt: string;
  errors: { leads: string | null; opportunities: string | null };
  error?: string;
}

function BigStat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-6 py-5 flex flex-col gap-1">
      <div className="text-xs text-zinc-500 uppercase tracking-widest">{label}</div>
      <div className="text-4xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

function PipelineBar({ stages }: { stages: Record<string, number> }) {
  const total = Object.values(stages).reduce((s, v) => s + v, 0);
  if (total === 0) return <div className="text-zinc-500 text-sm">No opportunities found</div>;

  const colors = [
    "bg-blue-500", "bg-yellow-400", "bg-orange-400", "bg-green-400", "bg-red-400",
    "bg-purple-400", "bg-pink-400", "bg-teal-400",
  ];

  return (
    <div className="space-y-3">
      {Object.entries(stages).map(([name, count], i) => (
        <div key={name} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-300">{name}</span>
            <span className="text-zinc-400">{count}</span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${colors[i % colors.length]}`}
              style={{ width: `${Math.round((count / total) * 100)}%` }}
            />
          </div>
        </div>
      ))}
      <div className="text-xs text-zinc-600 pt-1">Total: {total} opportunities</div>
    </div>
  );
}

export default function MetricsPage() {
  const [data, setData]       = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/metrics", { cache: "no-store" });
      setData(await res.json());
    } catch {
      setData({ leads: { today: 0, week: 0, month: 0 }, pipeline: {}, totalValue: 0, bookedCount: 0, conversionRate: 0, fetchedAt: new Date().toISOString(), errors: { leads: "Fetch failed", opportunities: null }, error: "Network error" });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMetrics();
    const t = setInterval(fetchMetrics, 10 * 60 * 1000); // refresh every 10 min
    return () => clearInterval(t);
  }, [fetchMetrics]);

  const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const fetchedTime = data?.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between sticky top-0 bg-zinc-950/95 backdrop-blur z-40">
        <div className="flex items-center gap-4">
          <a href="/" className="text-zinc-500 hover:text-white transition-colors text-sm">← Fluid OS</a>
          <div className="text-xl font-bold">
            <span className="text-white">Fluid</span><span className="text-blue-400">OS</span>
            <span className="text-zinc-500 font-normal text-sm ml-2">/ Metrics</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {fetchedTime && <span className="text-xs text-zinc-600">Updated {fetchedTime}</span>}
          <button onClick={fetchMetrics} disabled={loading}
            className="text-zinc-500 hover:text-white transition-colors disabled:opacity-40 text-sm">
            {loading ? "Loading..." : "↻ Refresh"}
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {data?.error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4 text-sm text-red-300">
            Error loading data: {data.error}
          </div>
        )}

        {/* New Leads */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">📥 New Leads (GHL Contacts)</h2>
          <div className="grid grid-cols-3 gap-4">
            <BigStat label="Today" value={loading ? "—" : data?.leads.today ?? 0} sub="last 24h" />
            <BigStat label="This Week" value={loading ? "—" : data?.leads.week ?? 0} sub="last 7 days" />
            <BigStat label="This Month" value={loading ? "—" : data?.leads.month ?? 0} sub="last 30 days" />
          </div>
          {data?.errors.leads && (
            <div className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{data.errors.leads}</div>
          )}
        </section>

        {/* Key Numbers */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">🎯 Performance</h2>
          <div className="grid grid-cols-3 gap-4">
            <BigStat label="Calls Booked" value={loading ? "—" : data?.bookedCount ?? 0} sub="in pipeline" />
            <BigStat label="Conversion Rate" value={loading ? "—" : `${data?.conversionRate ?? 0}%`} sub="lead → booked (30d)" />
            <BigStat label="Pipeline Value" value={loading ? "—" : fmt(data?.totalValue ?? 0)} sub="total open value" />
          </div>
        </section>

        {/* Pipeline Breakdown */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">📊 Pipeline Breakdown</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            {loading ? (
              <div className="text-zinc-500 text-sm animate-pulse">Loading pipeline...</div>
            ) : (
              <PipelineBar stages={data?.pipeline ?? {}} />
            )}
            {data?.errors.opportunities && (
              <div className="mt-3 text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{data.errors.opportunities}</div>
            )}
          </div>
        </section>

        <p className="text-center text-xs text-zinc-700 pb-4">Fluid OS Metrics · Data from GoHighLevel · Refreshes every 10 min</p>
      </div>
    </main>
  );
}
