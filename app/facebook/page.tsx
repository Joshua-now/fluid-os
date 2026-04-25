"use client";

import { useState } from "react";

const GROUPS = [
  {
    icon: "❄️",
    name: "FLORIDA HVAC-R HEADQUARTERS",
    meta: "HVAC · Florida",
    url: "https://www.facebook.com/groups/1976667799048170",
  },
  {
    icon: "🏢",
    name: "HVAC Business Owners & Contractors",
    meta: "HVAC · National",
    url: "https://www.facebook.com/groups/hvacbusinessownerscontractors/",
  },
  {
    icon: "🔧",
    name: "Refrigeration & AC Technicians",
    meta: "HVAC · Technicians",
    url: "https://www.facebook.com/groups/RefrigerationHvacr/",
  },
  {
    icon: "🏠",
    name: "Florida Roofers & General Contractors",
    meta: "Roofing · Florida",
    url: "https://www.facebook.com/groups/floridacontractorconnection/",
  },
  {
    icon: "🏚️",
    name: "Florida Roofing Contractor",
    meta: "Roofing · Florida",
    url: "https://www.facebook.com/groups/371049002143134/",
  },
  {
    icon: "👷",
    name: "FL Roofers Contractors & Subs",
    meta: "Roofing · Subs",
    url: "https://www.facebook.com/groups/1465539190883009",
  },
];

const WORKFLOWS = [
  { name: "Facebook Content Engine",        id: "fy9zcUBCYY8Uvnm1" },
  { name: "Facebook Comment Triage",         id: "TByF51tormGfeY7Q" },
  { name: "Facebook Group Check Reminders",  id: "RXD8IjPFu9bobrCg" },
];

export default function FacebookPage() {
  const [group,   setGroup]   = useState(GROUPS[0].name);
  const [comment, setComment] = useState("");
  const [status,  setStatus]  = useState<"idle" | "loading" | "success" | "error">("idle");
  const [msg,     setMsg]     = useState("");

  const triage = async () => {
    if (!comment.trim()) { setStatus("error"); setMsg("Paste a comment first."); return; }
    setStatus("loading"); setMsg("");
    try {
      const resp = await fetch("https://n8n-production-5955.up.railway.app/webhook/fb-comment-triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: comment.trim(), group }),
      });
      if (resp.ok) {
        setComment("");
        setStatus("success");
        setMsg("Done — check #ai-facebook in Slack for the result.");
      } else {
        throw new Error("HTTP " + resp.status);
      }
    } catch (e: unknown) {
      setStatus("error");
      setMsg(e instanceof Error ? e.message : "Unknown error");
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between sticky top-0 bg-zinc-950/95 backdrop-blur z-40">
        <div className="flex items-center gap-4">
          <a href="/" className="text-zinc-500 hover:text-white transition-colors text-sm">← Fluid OS</a>
          <div className="text-xl font-bold">
            <span className="text-white">Fluid</span><span className="text-blue-400">OS</span>
            <span className="text-zinc-500 font-normal text-sm ml-2">/ Facebook</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-600">6 groups · 3 workflows</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* Groups */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">📘 Facebook Groups</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {GROUPS.map((g) => (
              <a
                key={g.name}
                href={g.url}
                target="_blank"
                rel="noreferrer"
                className={`bg-zinc-900 border rounded-xl p-4 flex flex-col gap-2 hover:border-blue-500 transition-colors group ${g.unverified ? "border-zinc-700 opacity-70" : "border-zinc-800"}`}
              >
                <div className="text-2xl">{g.icon}</div>
                <div className="text-sm font-semibold text-zinc-100 group-hover:text-white leading-tight">{g.name}</div>
                <div className="text-xs text-zinc-500">{g.meta}</div>
                <div className={`text-xs font-medium mt-auto pt-1 ${g.unverified ? "text-zinc-600" : "text-blue-400"}`}>
                  {g.unverified ? "Search on Facebook →" : "Open group →"}
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Comment Triage */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">💬 Comment Triage</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
            <div>
              <p className="text-sm text-zinc-300 font-medium">Triage a Comment</p>
              <p className="text-xs text-zinc-500 mt-0.5">Paste a comment → Claude categorizes it &amp; drafts a reply → result posts to #ai-facebook in Slack</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Group</label>
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:border-blue-500 outline-none"
              >
                {GROUPS.map((g) => (
                  <option key={g.name} value={g.name}>{g.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Facebook Comment</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) triage(); }}
                placeholder="Paste the comment here..."
                rows={5}
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:border-blue-500 outline-none resize-y placeholder:text-zinc-600 leading-relaxed"
              />
            </div>

            <button
              onClick={triage}
              disabled={status === "loading"}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg text-sm font-semibold transition-colors"
            >
              {status === "loading" ? "Triaging..." : "Triage Comment →"}
            </button>

            {status === "success" && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 text-sm text-green-300">
                ✅ {msg}
              </div>
            )}
            {status === "error" && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300">
                ❌ {msg}
              </div>
            )}

            <p className="text-xs text-zinc-600 text-center">Ctrl+Enter to submit</p>
          </div>
        </section>

        {/* Workflows */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">🤖 Facebook Workflows</h2>
          <div className="space-y-2">
            {WORKFLOWS.map((wf) => (
              <a
                key={wf.id}
                href={`https://n8n-production-5955.up.railway.app/workflow/${wf.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl px-5 py-3.5 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">{wf.name}</span>
                </div>
                <span className="text-xs text-zinc-600 group-hover:text-zinc-400 transition-colors">Open in n8n →</span>
              </a>
            ))}
          </div>
        </section>

        <p className="text-center text-xs text-zinc-700 pb-4">Fluid OS · Facebook Command Center · Fluid Productions AI</p>
      </div>
    </main>
  );
}
