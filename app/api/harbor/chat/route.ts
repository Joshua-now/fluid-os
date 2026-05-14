/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
/**
 * Harbor — Fluid Productions Founder's AI
 * app/api/harbor/chat/route.ts
 *
 * POST { message: string, conversationHistory?: {role, content}[] }
 * → { reply: string }
 */

import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { HARBOR_TOOLS, HARBOR_SYSTEM_PROMPT, executeTool } from "@/lib/harbor/brain";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// claude-3.5-haiku: best tool-use performance at low cost (~$0.80/$4 per M tokens)
const OR_MODEL       = process.env.BOB_MODEL || "anthropic/claude-3.5-haiku";
const OLLAMA_URL     = process.env.RUNPOD_OLLAMA_URL
  ? `${process.env.RUNPOD_OLLAMA_URL}/v1/chat/completions`
  : null;
const OLLAMA_MODEL   = process.env.OLLAMA_MODEL || "llama3.1";
const MODEL_OVERRIDE = process.env.BOB_MODEL_OVERRIDE || null;

// Convert tool defs → OpenAI function format
const OPENAI_TOOLS = HARBOR_TOOLS.map((t: any) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  },
}));

function selectBackend(needsTools: boolean): "openrouter" | "ollama" {
  if (MODEL_OVERRIDE === "openrouter") return "openrouter";
  if (MODEL_OVERRIDE === "ollama") return "ollama";
  if (needsTools) return "openrouter";
  if (OLLAMA_URL) return "ollama";
  return "openrouter";
}

async function callOpenRouter(messages: any[], withTools: boolean): Promise<any> {
  const body: any = { model: OR_MODEL, messages, max_tokens: 1500 };
  if (withTools) { body.tools = OPENAI_TOOLS; body.tool_choice = "auto"; }
  const r = await axios.post(OPENROUTER_URL, body, {
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.SELF_URL || "https://fluid-os.up.railway.app",
      "X-Title": "Harbor - Fluid OS",
    },
    timeout: 60000,
  });
  return r.data;
}

async function callOllama(messages: any[]): Promise<any> {
  if (!OLLAMA_URL) throw new Error("RUNPOD_OLLAMA_URL not set");
  const r = await axios.post(OLLAMA_URL, { model: OLLAMA_MODEL, messages, stream: false }, {
    headers: { "Content-Type": "application/json" },
    timeout: 120000,
  });
  return r.data;
}

async function chat(messages: any[], needsTools: boolean): Promise<any> {
  const backend = selectBackend(needsTools);
  if (backend === "ollama") {
    try {
      console.log(`[Harbor] → Ollama (${OLLAMA_MODEL})`);
      return await callOllama(messages);
    } catch (err: any) {
      console.warn("[Harbor] Ollama unreachable, falling back to OpenRouter:", err.message);
      return await callOpenRouter(messages, false);
    }
  }
  console.log(`[Harbor] → OpenRouter (${OR_MODEL})`);
  return await callOpenRouter(messages, needsTools);
}

export async function POST(req: NextRequest) {
  try {
    const { message, conversationHistory = [] } = await req.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: "No message provided." }, { status: 400 });
    }
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY not set." }, { status: 500 });
    }

    const messages: any[] = [
      { role: "system", content: HARBOR_SYSTEM_PROMPT },
      ...conversationHistory.map((m: any) => ({
        role: m.role === "harbor" ? "assistant" : m.role,
        content: m.content,
      })),
      { role: "user", content: message },
    ];

    let iterations = 0;
    while (iterations < 8) {
      iterations++;
      const data = await chat(messages, true);
      const choice = data.choices?.[0];
      const msg = choice?.message;
      if (!msg) break;

      messages.push(msg);
      const finishReason = choice?.finish_reason;

      if (finishReason !== "tool_calls" || !msg.tool_calls?.length) {
        return NextResponse.json({
          reply: msg.content || "Done.",
          model: selectBackend(false) === "ollama" ? OLLAMA_MODEL : OR_MODEL,
        });
      }

      const toolResults = await Promise.all(
        msg.tool_calls.map(async (tc: any) => {
          let args: any = {};
          try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
          console.log(`[Harbor] Tool: ${tc.function.name}`);
          const result = await executeTool(tc.function.name, args);
          return {
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          };
        })
      );

      messages.push(...toolResults);
    }

    return NextResponse.json({ reply: "Done.", model: OR_MODEL });
  } catch (err: any) {
    console.error("[Harbor] Error:", err?.response?.data || err?.message);
    return NextResponse.json({ error: "Harbor hit an error. Check Railway logs." }, { status: 500 });
  }
}
