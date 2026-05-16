/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
/**
 * Harbor — Fluid Productions Founder's AI
 * app/api/harbor/chat/route.ts
 *
 * POST { message: string, conversationHistory?: {role, content}[] }
 * → { reply: string }
 *
 * Env vars:
 *   OPENROUTER_API_KEY  — required
 *   BOB_MODEL           — OpenRouter model slug (default: anthropic/claude-3-5-haiku)
 *   SELF_URL            — HTTP-Referer header for OpenRouter
 */

import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { HARBOR_TOOLS, HARBOR_SYSTEM_PROMPT, executeTool } from "@/lib/harbor/brain";
import { isAuthenticated, unauthorizedResponse } from "@/lib/authGuard";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Default: Claude Haiku — reliable tool calling, won't hallucinate stats
const OR_MODEL = process.env.BOB_MODEL || "anthropic/claude-3-5-haiku";

// Per-tool execution timeout — prevents a single stuck tool from hanging the whole request
const TOOL_TIMEOUT_MS = 15_000;

// Convert tool defs → OpenAI function format
const OPENAI_TOOLS = HARBOR_TOOLS.map((t: any) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  },
}));

async function callOpenRouter(messages: any[], withTools: boolean): Promise<any> {
  const body: any = { model: OR_MODEL, messages, max_tokens: 1500 };
  if (withTools) {
    body.tools = OPENAI_TOOLS;
    body.tool_choice = "auto";
  }
  const r = await axios.post(OPENROUTER_URL, body, {
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.SELF_URL || "https://fluid-os.up.railway.app",
      "X-Title": "Harbor - Fluid OS",
    },
    timeout: 60_000,
  });
  return r.data;
}

/** Execute a single tool with a hard timeout */
async function executeToolWithTimeout(name: string, args: any): Promise<any> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Tool "${name}" timed out after ${TOOL_TIMEOUT_MS}ms`)), TOOL_TIMEOUT_MS)
  );
  return Promise.race([executeTool(name, args), timeoutPromise]);
}

export async function POST(req: NextRequest) {
  if (!isAuthenticated(req)) return unauthorizedResponse();

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

    // Agentic loop — max 8 iterations to prevent runaway tool chains
    let iterations = 0;
    while (iterations < 8) {
      iterations++;

      const data = await callOpenRouter(messages, true);
      const choice = data.choices?.[0];
      const msg = choice?.message;
      if (!msg) break;

      messages.push(msg);
      const finishReason = choice?.finish_reason;

      // No tool calls → final reply
      if (finishReason !== "tool_calls" || !msg.tool_calls?.length) {
        return NextResponse.json({
          reply: msg.content || "Done.",
          model: OR_MODEL,
        });
      }

      // Execute tool calls in parallel, each with a per-tool timeout
      const toolResults = await Promise.all(
        msg.tool_calls.map(async (tc: any) => {
          let args: any = {};
          try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}

          console.log(`[Harbor] Tool: ${tc.function.name}`);
          let result: any;
          try {
            result = await executeToolWithTimeout(tc.function.name, args);
          } catch (toolErr: any) {
            console.error(`[Harbor] Tool error (${tc.function.name}):`, toolErr.message);
            result = { error: toolErr.message };
          }

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
