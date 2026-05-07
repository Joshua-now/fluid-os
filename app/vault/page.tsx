"use client";

import { useEffect, useState, useCallback } from "react";
import { daysUntilExpiry, expiryStatus } from "@/lib/credentials";

// ─── Types ────────────────────────────────────────────────────────────────────
interface CredSummary {
  id: string;
  name: string;
  service: string;
  description: string;
  expiresAt: string | null;
  locationCount: number;
  locationSummary: string;
  hasValue: boolean;
}

interface PropagateResult {
  location: string;
  ok: boolean;
  note?: string;
}

// ─── Expiry badge ─────────────────────────────────────────────────────────────
function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  const days = daysUntilExpiry(expiresAt);
  const status = expiryStatus(days);

  if (status === "unknown") {
    return <span className="text-xs text-zinc-500">No expiry set</span>;
  }

  const colors = {
    ok: "bg-green-900/40 text-green-400 border-green-800",
    warning: "bg-yellow-900/40 text-yellow-400 border-yellow-800",
    critical: "bg-red-900/40 text-red-400 border-red-800",
  };

  const label =
    days! < 0
      ? `Expired ${Math.abs(days!)}d ago`
      : days === 0
      ? "Expires today"
      : `${days}d remaining`;

  return (
    <span className={`text-xs px-2 py-0.5 rounded border ${colors[status]}`}>
      {label}
    </span>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({
  cred,
  onSave,
  onCancel,
}: {
  cred: CredSummary;
  onSave: (value: string, expiresAt: string) => Promise<PropagateResult[]>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [expiresAt, setExpiresAt] = useState(cred.expiresAt ?? "");
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<PropagateResult[] | null>(null);
  const [showValue, setShowValue] = useState(false);

  const handleSave = async () => {
    if (!value.trim()) return;
    setSaving(true);
    const r = await onSave(value.trim(), expiresAt);
    setResults(r);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div>
            <h2 className="font-semibold">{cred.name}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{cred.description}</p>
          </div>
          <button onClick={onCancel} className="text-zinc-400 hover:text-white text-xl leading-none ml-4">×</button>
        </div>

        {!results ? (
          <div className="p-5 space-y-4">
            {/* New value */}
            <div>
              <label className="text-xs text-zinc-400 font-medium block mb-1.5">New Value</label>
              <div className="relative">
                <input
                  type={showValue ? "text" : "password"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Paste new key here..."
                  className="w-full px-3 py-2.5 pr-16 bg-zinc-800 rounded-lg text-sm border border-zinc-700 focus:border-blue-500 outline-none font-mono"
                  autoFocus
                />
                <button
                  onClick={() => setShowValue(!showValue)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-300"
                >
                  {showValue ? "hide" : "show"}
                </button>
              </div>
            </div>

            {/* Expiry date */}
            <div>
              <label className="text-xs text-zinc-400 font-medium block mb-1.5">Expiry Date (optional)</label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="px-3 py-2 bg-zinc-800 rounded-lg text-sm border border-zinc-700 focus:border-blue-500 outline-none text-zinc-200"
              />
            </div>

            {/* Where it propagates */}
            <div>
              <label className="text-xs text-zinc-400 font-medium block mb-1.5">Will update ({cred.locationCount} locations)</label>
              <p className="text-xs text-zinc-500 bg-zinc-800 rounded-lg px-3 py-2 font-mono">{cred.locationSummary}</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={onCancel}
                className="flex-1 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!value.trim() || saving}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-colors"
              >
                {saving ? "Propagating..." : "Save & Push Everywhere"}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            <p className="text-sm font-medium text-zinc-200 mb-3">Propagation results:</p>
            {results.map((r, i) => (
              <div key={i} className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${r.ok ? "bg-green-900/20 border border-green-800" : "bg-red-900/20 border border-red-800"}`}>
                <span>{r.ok ? "✅" : "❌"}</span>
                <div>
                  <span className="font-mono text-xs text-zinc-300">{r.location}</span>
                  {r.note && <p className="text-xs text-zinc-400 mt-0.5">{r.note}</p>}
                </div>
              </div>
            ))}
            <button
              onClick={onCancel}
              className="w-full mt-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Reveal Modal ─────────────────────────────────────────────────────────────
function RevealModal({ cred, onClose }: { cred: CredSummary; onClose: () => void }) {
  const [value, setValue]   = useState<string | null>(null);
  const [hint, setHint]     = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied]  = useState(false);

  useEffect(() => {
    fetch(`/api/vault/credentials/reveal?id=${cred.id}`)
      .then((r) => r.json())
      .then((d) => {
        setValue(d.value ?? null);
        setHint(d.hint ?? "");
        setLoading(false);
      })
      .catch(() => {
        setHint("Failed to fetch value.");
        setLoading(false);
      });
  }, [cred.id]);

  const copy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div>
            <h2 className="font-semibold">{cred.name}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Current live value</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-xl leading-none ml-4">×</button>
        </div>
        <div className="p-5 space-y-4">
          {loading ? (
            <p className="text-sm text-zinc-400">Loading…</p>
          ) : value ? (
            <>
              <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 font-mono text-xs text-green-400 break-all">
                {value}
              </div>
              <button
                onClick={copy}
                className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition-colors"
              >
                {copied ? "Copied ✓" : "Copy to clipboard"}
              </button>
            </>
          ) : (
            <p className="text-sm text-zinc-400">{hint || "Value not available."}</p>
          )}
          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Login gate ───────────────────────────────────────────────────────────────
function LoginGate({ onAuth }: { onAuth: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/vault/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    setLoading(false);
    if (res.ok) {
      onAuth();
    } else {
      setError("Wrong password.");
      setPw("");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">🔐</div>
          <h1 className="text-xl font-bold text-white">Credential Vault</h1>
          <p className="text-sm text-zinc-500 mt-1">Enter your vault password to continue</p>
        </div>
        <div className="space-y-3">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Password"
            className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-sm focus:border-blue-500 outline-none"
            autoFocus
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={submit}
            disabled={!pw || loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg text-sm font-semibold transition-colors"
          >
            {loading ? "Checking..." : "Unlock Vault"}
          </button>
        </div>
        <p className="text-center text-xs text-zinc-600 mt-4">
          Session lasts 8 hours ·{" "}
          <a href="/" className="hover:text-zinc-400 transition-colors">← Back to FluidOS</a>
        </p>
      </div>
    </div>
  );
}

// ─── Main Vault Dashboard ─────────────────────────────────────────────────────
export default function VaultPage() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [creds, setCreds] = useState<CredSummary[]>([]);
  const [editing, setEditing] = useState<CredSummary | null>(null);
  const [revealing, setRevealing] = useState<CredSummary | null>(null);

  // Check if already authed via cookie
  useEffect(() => {
    fetch("/api/vault/credentials")
      .then((r) => {
        if (r.ok) {
          setAuthed(true);
          return r.json();
        }
        return null;
      })
      .then((data) => {
        if (data) setCreds(data);
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);

  const loadCreds = useCallback(async () => {
    const r = await fetch("/api/vault/credentials");
    if (r.ok) setCreds(await r.json());
  }, []);

  const onAuth = async () => {
    setAuthed(true);
    await loadCreds();
  };

  const handleSave = async (cred: CredSummary, value: string, expiresAt: string) => {
    const res = await fetch("/api/vault/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cred.id, value, expiresAt }),
    });
    const data = await res.json();
    await loadCreds();
    return data.propagated ?? [];
  };

  const logout = async () => {
    await fetch("/api/vault/auth", { method: "DELETE" });
    setAuthed(false);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (!authed) return <LoginGate onAuth={onAuth} />;

  // Group by service
  const grouped = creds.reduce<Record<string, CredSummary[]>>((acc, c) => {
    acc[c.service] = acc[c.service] ?? [];
    acc[c.service].push(c);
    return acc;
  }, {});

  const criticalCreds = creds.filter((c) => expiryStatus(daysUntilExpiry(c.expiresAt)) === "critical");
  const warningCreds  = creds.filter((c) => expiryStatus(daysUntilExpiry(c.expiresAt)) === "warning");

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between sticky top-0 bg-zinc-950/95 backdrop-blur z-40">
        <div className="flex items-center gap-3">
          <a href="/" className="text-zinc-500 hover:text-white text-sm transition-colors">← FluidOS</a>
          <span className="text-zinc-700">/</span>
          <div className="flex items-center gap-2">
            <span className="text-lg">🔐</span>
            <span className="font-bold tracking-tight">Credential Vault</span>
          </div>
        </div>
        <button onClick={logout} className="text-xs text-zinc-500 hover:text-red-400 transition-colors">
          Lock vault
        </button>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

        {/* Alert banners */}
        {criticalCreds.length > 0 && (
          <div className="bg-red-900/20 border border-red-800 rounded-xl px-5 py-4">
            <p className="text-sm font-semibold text-red-400 mb-1">🔴 Expired credentials</p>
            <p className="text-xs text-red-300">{criticalCreds.map((c) => c.name).join(" · ")} — update immediately</p>
          </div>
        )}
        {warningCreds.length > 0 && (
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl px-5 py-4">
            <p className="text-sm font-semibold text-yellow-400 mb-1">⚠️ Expiring soon</p>
            <p className="text-xs text-yellow-300">{warningCreds.map((c) => c.name).join(" · ")} — rotate before they expire</p>
          </div>
        )}

        {/* Credential table by service */}
        {Object.entries(grouped).map(([service, items]) => (
          <section key={service}>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">{service}</h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800">
              {items.map((cred) => {
                const days   = daysUntilExpiry(cred.expiresAt);
                const status = expiryStatus(days);
                const dotColor = {
                  ok: "bg-green-400",
                  warning: "bg-yellow-400",
                  critical: "bg-red-500",
                  unknown: "bg-zinc-600",
                }[status];

                return (
                  <div key={cred.id} className="flex items-center justify-between px-5 py-4 hover:bg-zinc-800/50 transition-colors group">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-zinc-100">{cred.name}</span>
                          <ExpiryBadge expiresAt={cred.expiresAt} />
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">{cred.description}</p>
                        <p className="text-xs text-zinc-600 mt-0.5">
                          {cred.locationCount} location{cred.locationCount !== 1 ? "s" : ""} · {cred.locationSummary}
                        </p>
                      </div>
                    </div>
                    <div className="ml-4 flex-shrink-0 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => setRevealing(cred)}
                        className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-emerald-700 border border-zinc-700 hover:border-emerald-600 rounded-lg transition-all"
                      >
                        Reveal
                      </button>
                      <button
                        onClick={() => setEditing(cred)}
                        className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-blue-600 border border-zinc-700 hover:border-blue-500 rounded-lg transition-all"
                      >
                        Rotate
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <p className="text-center text-xs text-zinc-700 pb-4">
          Fluid OS Vault · Changes propagate to n8n and Railway automatically
        </p>
      </div>

      {/* Reveal modal */}
      {revealing && (
        <RevealModal cred={revealing} onClose={() => setRevealing(null)} />
      )}

      {/* Edit modal */}
      {editing && (
        <EditModal
          cred={editing}
          onSave={(v, e) => handleSave(editing, v, e)}
          onCancel={() => { setEditing(null); loadCreds(); }}
        />
      )}
    </main>
  );
}
