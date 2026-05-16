import { NextRequest, NextResponse } from "next/server";
import { CREDENTIALS } from "@/lib/credentials";

export const dynamic = "force-dynamic";

const N8N_BASE = process.env.N8N_BASE_URL ?? "https://n8n-production-5955.up.railway.app";
const N8N_KEY  = process.env.N8N_API_KEY ?? "";

// Key→value store backed by Railway env vars on this service
// We keep a runtime map so we can read back values we've set this session
const runtimeValues: Record<string, string> = {};

function isAuthed(req: NextRequest) {
  return req.cookies.get("vault_auth")?.value === "1";
}

// GET — return credential list (values masked)
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = CREDENTIALS.map((c) => ({
    id: c.id,
    name: c.name,
    service: c.service,
    description: c.description,
    expiresAt: c.expiresAt,
    locationCount: c.locations.length,
    locationSummary: c.locations.map((l) => l.type).join(", "),
    hasValue: !!runtimeValues[c.id],
  }));

  return NextResponse.json(list);
}

// POST — update a credential and propagate everywhere
export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, value, expiresAt } = await req.json();
  if (!id || !value) return NextResponse.json({ error: "id and value required" }, { status: 400 });

  const cred = CREDENTIALS.find((c) => c.id === id);
  if (!cred) return NextResponse.json({ error: "Unknown credential" }, { status: 404 });

  runtimeValues[id] = value;
  if (expiresAt) cred.expiresAt = expiresAt;

  const results: { location: string; ok: boolean; note?: string }[] = [];

  for (const loc of cred.locations) {
    if (loc.type === "manual") {
      results.push({ location: "manual", ok: true, note: loc.note });
      continue;
    }

    if (loc.type === "n8n_code") {
      try {
        // Fetch workflow
        const wfRes = await fetch(`${N8N_BASE}/api/v1/workflows/${loc.workflowId}`, {
          headers: { "X-N8N-API-KEY": N8N_KEY },
          signal: AbortSignal.timeout(8000),
        });
        if (!wfRes.ok) throw new Error(`Fetch failed: ${wfRes.status}`);
        const wf = await wfRes.json();

        // Replace old value in matching nodes
        let changed = false;
        for (const node of wf.nodes ?? []) {
          if (!loc.nodeNames.includes(node.name)) continue;
          const code: string = node.parameters?.jsCode ?? "";
          if (!code) continue;
          // Replace any Bearer token or quoted string that contains the OLD value
          // We store the old value keyed by credential id in runtimeValues
          // Strategy: replace all occurrences of the previous value if we know it
          // Since we may not know old value, we replace by pattern based on cred id
          const updated = replaceKeyInCode(code, id, value);
          if (updated !== code) {
            node.parameters.jsCode = updated;
            changed = true;
          }
        }

        if (!changed) {
          results.push({ location: `n8n:${loc.workflowId}`, ok: true, note: "No matching pattern found in code — may need manual update" });
          continue;
        }

        // Push back
        const allowed = ["timezone","saveExecutionProgress","saveManualExecutions","saveDataErrorExecution","saveDataSuccessExecution","executionTimeout","errorWorkflow","callerPolicy","executionOrder"];
        const settings = Object.fromEntries(Object.entries(wf.settings ?? {}).filter(([k]) => allowed.includes(k)));
        const putRes = await fetch(`${N8N_BASE}/api/v1/workflows/${loc.workflowId}`, {
          method: "PUT",
          headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings, staticData: wf.staticData }),
          signal: AbortSignal.timeout(10000),
        });
        results.push({ location: `n8n:${loc.workflowId}`, ok: putRes.ok, note: putRes.ok ? "Updated" : `PUT failed: ${putRes.status}` });
      } catch (e: unknown) {
        results.push({ location: `n8n:${loc.workflowId}`, ok: false, note: String(e) });
      }
    }

    if (loc.type === "railway") {
      results.push({ location: `railway:${loc.varName}`, ok: true, note: "Railway vars must be updated via Railway dashboard or CLI — open Railway and set " + loc.varName });
    }
  }

  return NextResponse.json({ ok: true, id, propagated: results });
}

// Replace known credential patterns in JS code strings
function replaceKeyInCode(code: string, credId: string, newValue: string): string {
  const patterns: Record<string, RegExp[]> = {
    instantly_api_key: [
      /(['"`])MTlj[A-Za-z0-9+/=]{40,}\1/g,
    ],
    openrouter_key: [
      /(['"`])sk-or-v1-[a-f0-9]{60,}\1/g,
    ],
    slack_bot_token: [
      /(['"`])xoxb-[0-9]+-[0-9]+-[A-Za-z0-9]+\1/g,
    ],
    telnyx_api_key: [
      /(['"`])KEY[0-9A-F]{30,}_[A-Za-z0-9]+\1/g,
    ],
    n8n_api_key: [
      /(['"`])eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\1/g,
    ],
    shotstack_api_key: [
      /(['"`])[A-Za-z0-9]{30,}\1(?=.*shotstack|.*SHOTSTACK)/gi,
    ],
  };

  const regexes = patterns[credId];
  if (!regexes) return code;

  let result = code;
  for (const re of regexes) {
    result = result.replace(re, (match) => {
      const quote = match[0];
      return quote + newValue + quote;
    });
  }
  return result;
}
