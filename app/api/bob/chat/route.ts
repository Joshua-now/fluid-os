/**
 * fluid-os/app/api/bob/chat/route.ts
 *
 * POST { message: string, conversationHistory?: {role, content}[] }
 * → { reply: string }
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { BOB_TOOLS, BOB_SYSTEM_PROMPT, executeTool } from "@/lib/bob/brain";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { message, conversationHistory = [] } = await req.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: "No message provided." }, { status: 400 });
    }

    const messages: Anthropic.MessageParam[] = [
      ...conversationHistory,
      { role: "user", content: message },
    ];

    // ── Agentic tool loop ──────────────────────────────────────────────────────
    let response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1500,
      system: BOB_SYSTEM_PROMPT,
      tools: BOB_TOOLS,
      messages,
    });

    let iterations = 0;
    while (response.stop_reason === "tool_use" && iterations < 8) {
      iterations++;
      const toolUses = response.content.filter((c) => c.type === "tool_use") as Anthropic.ToolUseBlock[];

      // Run all tool calls in parallel
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (t) => ({
          type: "tool_result" as const,
          tool_use_id: t.id,
          content: JSON.stringify(await executeTool(t.name, t.input)),
        }))
      );

      // Feed results back
      messages.push(
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults }
      );

      response = await anthropic.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 1500,
        system: BOB_SYSTEM_PROMPT,
        tools: BOB_TOOLS,
        messages,
      });
    }

    const reply = response.content
      .filter((c) => c.type === "text")
      .map((c) => (c as Anthropic.TextBlock).text)
      .join("\n");

    return NextResponse.json({ reply: reply || "Done." });
  } catch (err: any) {
    console.error("[Bob] Chat error:", err?.message);
    return NextResponse.json({ error: "Bob hit an error. Check logs." }, { status: 500 });
  }
}
