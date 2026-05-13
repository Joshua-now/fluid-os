/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
/**
 * fluid-os/app/api/bob/chat/route.ts
 *
 * POST { message: string, conversationHistory?: {role, content}[] }
 * → { reply: string }
 *
 * Uses OpenRouter (OpenAI-compatible) with tool calling.
 */

import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { BOB_TOOLS, BOB_SYSTEM_PROMPT, executeTool } from "@/lib/bob/brain";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const BOB_MODEL = process.env.BOB_MODEL || "anthropic/claude-opus-4-5";

// Convert Anthropic-style tool defs → OpenAI function format
const OPENAI_TOOLS = BOB_TOOLS.map((t: any) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  },
}));

async function orChat(messages: any[]): Promise<any> {
  const r = await axios.post(
    OPENROUTER_URL,
    {
      model: BOB_MODEL,
      messages,
      tools: OPENAI_TOOLS,
      tool_choice: "auto",
      max_tokens: 1500,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.SELF_URL || "https://fluid-os.up.railway.app",
        "X-Title": "Bob - Fluid OS",
      },
      timeout: 60000,
    }
  );
  return r.data;
}

export async function POST(req: NextRequest) {
  try {
    const { message, conversationHistory = [] } = await req.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: "No message provided." }, { status: 400 });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY not set on this service." }, { status: 500 });
    }

    // Build messages array (OpenAI format)
    const messages: any[] = [
      { role: "system", content: BOB_SYSTEM_PROMPT },
      ...conversationHistory.map((m: any) => ({
        role: m.role === "bob" ? "assistant" : m.role,
        content: m.content,
      })),
      { role: "user", content: message },
    ];

    // ── Agentic tool loop ──────────────────────────────────────────────────────
    let iterations = 0;
    while (iterations < 8) {
      iterations++;

      const data = await orChat(messages);
      const choice = data.choices?.[0];
      const msg = choice?.message;

      if (!msg) break;

      // Append assistant message to history
      messages.push(msg);

      const finishReason = choice?.finish_reason;

      // If no tool calls — we have the final reply
      if (finishReason !== "tool_calls" || !msg.tool_calls?.length) {
        const reply = msg.content || "Done.";
        return NextResponse.json({ reply });
      }

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        msg.tool_calls.map(async (tc: any) => {
          let args: any = {};
          try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
          const result = await executeTool(tc.function.name, args);
          return {
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          };
        })
      );

      // Add tool results to messages and loop
      messages.push(...toolResults);
    }

    return NextResponse.json({ reply: "Done." });
  } catch (err: any) {
    console.error("[Bob] Chat error:", err?.response?.data || err?.message);
    return NextResponse.json(
      { error: "Bob hit an error. Check Railway logs." },
      { status: 500 }
    );
  }
}
