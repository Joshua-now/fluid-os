// DEPRECATED — Bob has been renamed Harbor.
// The live brain is at lib/harbor/brain.ts
// This file is intentionally empty. Do not import from here.

export const BOB_TOOLS: never[] = [];
export const BOB_SYSTEM_PROMPT = "";
export async function executeTool(): Promise<never> {
  throw new Error("lib/bob/brain is deprecated. Use lib/harbor/brain.");
}
