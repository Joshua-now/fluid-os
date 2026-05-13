"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */
type Role = "user" | "harbor";
interface Message { id: string; role: Role; text: string; ts: number }
interface ServiceStatus { slack: string; ghl: string; instantly: string; switchboard: string; n8n: string }

const QUICK_ACTIONS = [
  { label: "System status",      prompt: "Give me a full system status check — GHL, Instantly, Switchboard, n8n, and Slack." },
  { label: "Campaign stats",     prompt: "What are my current Instantly campaign stats and performance?" },
  { label: "Recent contacts",    prompt: "Show me the most recent contacts in GHL and what stage they're in." },
  { label: "Switchboard check",  prompt: "Check Switchboard — any live conversations or hand raises right now?" },
  { label: "n8n issues",         prompt: "Any n8n workflow errors or failures I should know about?" },
  { label: "Write cold email",   prompt: "Write me a cold email for Speed-to-Lead targeting HVAC contractors in Florida." },
];

/* ─────────────────────────────────────────
   Tiny helpers
───────────────────────────────────────── */
function uid() { return Math.random().toString(36).slice(2, 10) }

function Dot({ color }: { color: string }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function statusColor(v: string) {
  if (!v || v === "unknown") return "bg-zinc-600";
  const s = v.toLowerCase();
  if (s === "online" || s === "ok" || s === "active") return "bg-emerald-400";
  if (s === "degraded" || s === "slow") return "bg-yellow-400";
  return "bg-red-500";
}

/* ─────────────────────────────────────────
   Voice Button
───────────────────────────────────────── */
function VoiceButton({ onTranscript, disabled }: { onTranscript: (t: string) => void; disabled: boolean }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  const toggle = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { alert("Voice input requires Chrome or Edge."); return; }

    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }

    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    recRef.current = rec;

    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      onTranscript(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend   = () => setListening(false);

    rec.start();
    setListening(true);
  }, [listening, onTranscript]);

  return (
    <button
      onClick={toggle}
      disabled={disabled}
      title={listening ? "Stop recording" : "Voice input"}
      className={`flex items-center justify-center w-9 h-9 rounded-lg transition-all text-base
        ${listening
          ? "bg-red-600 hover:bg-red-700 animate-pulse"
          : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white"}
        disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {listening ? "⏹" : "🎤"}
    </button>
  );
}

/* ─────────────────────────────────────────
   Status Bar
───────────────────────────────────────── */
function StatusBar({ status, loading }: { status: ServiceStatus | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-500 px-4 py-2 border-b border-zinc-800">
        <span className="w-2 h-2 rounded-full bg-zinc-600 animate-pulse" />
        Checking Harbor…
      </div>
    );
  }
  if (!status) {
    return (
      <div className="flex items-center gap-2 text-xs text-red-400 px-4 py-2 border-b border-zinc-800">
        <Dot color="bg-red-500" /> Unable to reach Harbor
      </div>
    );
  }
  const chips = [
    { label: "Slack",       val: status.slack },
    { label: "GHL",         val: status.ghl },
    { label: "Instantly",   val: status.instantly },
    { label: "Switchboard", val: status.switchboard },
    { label: "n8n",         val: status.n8n },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950/60">
      {chips.map(({ label, val }) => (
        <span key={label} className="flex items-center gap-1.5 text-xs text-zinc-400">
          <Dot color={statusColor(val)} />
          {label}
        </span>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────
   Message Bubble
───────────────────────────────────────── */
function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold mr-2 mt-0.5">
          ⚓
        </div>
      )}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
          ${isUser
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-zinc-800 text-zinc-100 rounded-bl-sm"}`}
      >
        <p className="whitespace-pre-wrap">{msg.text}</p>
        {msg.ts > 0 && (
          <p className="text-[10px] mt-1 opacity-40 text-right">
            {new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
      {isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold ml-2 mt-0.5">
          J
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   Main Component
───────────────────────────────────────── */
export default function HarborChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "harbor",
      text: "Hey Joshua 👋 Harbor online. I've got eyes on GHL, Instantly, Switchboard, n8n, and Slack. What do you need?",
      ts: 0,
    },
  ]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [status, setStatus]     = useState<ServiceStatus | null>(null);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const textareaRef             = useRef<HTMLTextAreaElement>(null);
  const sendingRef              = useRef(false);

  /* Fetch status on mount */
  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch(`/api/harbor/status`, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const raw = await res.json();
          setStatus({
            slack:       raw.slack?.ok       ? "online" : (raw.slack       ? "offline" : "unknown"),
            ghl:         raw.ghl?.ok         ? "online" : (raw.ghl         ? "offline" : "unknown"),
            instantly:   raw.instantly?.ok   ? "online" : (raw.instantly   ? "offline" : "unknown"),
            switchboard: raw.switchboard?.ok ? "online" : (raw.switchboard ? "offline" : "unknown"),
            n8n:         raw.n8n?.ok         ? "online" : (raw.n8n         ? "offline" : "unknown"),
          });
        }
      } catch {
        // leave null
      } finally {
        setStatusLoading(false);
      }
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 60_000);
    return () => clearInterval(interval);
  }, []);

  /* Auto-scroll */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* Auto-resize textarea */
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
  };

  /* Send message */
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sendingRef.current) return;
    sendingRef.current = true;

    const userMsg: Message = { id: uid(), role: "user", text: trimmed, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }

    const history = messages.map(m => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text,
    }));

    try {
      const res = await fetch(`/api/harbor/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          conversationHistory: history,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const replyText = data.reply || data.response || data.message || JSON.stringify(data);

      setMessages(prev => [...prev, { id: uid(), role: "harbor", text: replyText, ts: Date.now() }]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      setMessages(prev => [...prev, {
        id: uid(), role: "harbor",
        text: `⚠️ Harbor error — ${errMsg}. Check Railway logs.`,
        ts: Date.now(),
      }]);
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  }, [messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col">

      {/* ── Header ── */}
      <header className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between sticky top-0 bg-zinc-950/95 backdrop-blur z-40">
        <div className="flex items-center gap-3">
          <a href="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            ← Fluid OS
          </a>
          <span className="text-zinc-700">/</span>
          <span className="text-sm font-semibold text-white">⚓ Harbor</span>
          <span className="text-xs text-zinc-500 hidden sm:inline">— Founder&apos;s AI</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">25 tools</span>
          <span className="text-xs bg-indigo-600/20 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-600/30">
            LIVE
          </span>
        </div>
      </header>

      {/* ── Status Bar ── */}
      <StatusBar status={status} loading={statusLoading} />

      {/* ── Quick Actions ── */}
      <div className="px-4 py-3 border-b border-zinc-800/60 flex gap-2 overflow-x-auto scrollbar-hide">
        {QUICK_ACTIONS.map(({ label, prompt }) => (
          <button
            key={label}
            onClick={() => sendMessage(prompt)}
            disabled={loading}
            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-600 transition-all disabled:opacity-40"
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map(msg => (
          <Bubble key={msg.id} msg={msg} />
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold mr-2 mt-0.5">
              ⚓
            </div>
            <div className="bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input Bar ── */}
      <div className="border-t border-zinc-800 bg-zinc-950 px-4 py-3">
        <div className="flex items-end gap-2 bg-zinc-900 rounded-xl border border-zinc-700 focus-within:border-indigo-600/60 transition-colors px-3 py-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Message Harbor… (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 resize-none outline-none py-1 min-h-[28px] max-h-[140px]"
          />
          <div className="flex items-center gap-2 pb-0.5">
            <VoiceButton onTranscript={t => sendMessage(t)} disabled={loading} />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-base"
            >
              ↑
            </button>
          </div>
        </div>
        <p className="text-[10px] text-zinc-600 text-center mt-2">
          Harbor is connected to GHL · Instantly · Switchboard · n8n · Slack
        </p>
      </div>
    </main>
  );
}
