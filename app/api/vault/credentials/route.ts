import { NextRequest, NextResponse } from "next/server";
import { CREDENTIALS } from "@/lib/credentials";

export const dynamic = "force-dynamic";

const N8N_BASE = "https://n8n-production-5955.up.railway.app";
const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN ?? "";
const RAILWAY_GQL = "https://backboard.railway.app/graphql/v2";

// Key→value store backed by Railway env vars on this service
// We keep a runtime map so we can read back values we've set this session
const runtimeValues: Record<string, string> = {};

// Cache Railway project/service IDs to avoid redundant API lookups per request
const railwayIdCache: Record<string, { projectId: string; serviceId: string; environmentId: string }> = {};

function isAuthed(req: NextRequest) {
  return req.cookies.get("vault_auth")?.value === "1";
}

// Look up Railway project/service IDs by name (cached per process)
async function getRailwayIds(projectName: string, serviceName: string) {
  const cacheKey = `${projectName}::${serviceName}`;
  if (railwayIdCache[cacheKey]) return railwayIdCache[cacheKey];

  const res = await fetch(RAILWAY_GQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RAILWAY_TOKEN}`,
    },
    body: JSON.stringify({
      query: `{
        me {
          projects {
            edges {
              node {
                id
                name
                services { edges { node { id name } } }
                environments { edges { node { id name } } }
              }
            }
          }
        }
      }`,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Railway API error: ${res.status}`);
  const data = await res.json();

  type RailwayProject = {
    id: string;
    name: string;
    services: { edges: Array<{ node: { id: string; name: string } }> };
    environments: { edges: Array<{ node: { id: string; name: string } }> };
  };

  const projects: RailwayProject[] =
    data?.data?.me?.projects?.edges?.map((e: { node: RailwayProject }) => e.node) ?? [];

  const project = projects.find((p) => p.name === projectName);
  if (!project) throw new Error(`Railway project not found: "${projectName}"`);

  const service = project.services.edges.map((e) => e.node).find((s) => s.name === serviceName);
  if (!service) throw new Error(`Railway service not found: "${serviceName}" in project "${projectName}"`);

  const environment = project.environments.edges
    .map((e) => e.node)
    .find((e) => e.name === "production");
  if (!environment) throw new Error(`No "production" environment in project "${projectName}"`);

  const ids = { projectId: project.id, serviceId: service.id, environmentId: environment.id };
  railwayIdCache[cacheKey] = ids;
  return ids;
}

// Push a variable to Railway via the variableUpsert mutation
async function pushToRailway(
  varName: string,
  value: string,
  projectName: string,
  serviceName: string
): Promise<{ ok: boolean; note: string }> {
  if (!RAILWAY_TOKEN) {
    return {
      ok: false,
      note: "RAILWAY_TOKEN env var not set on this service — add it in the Railway dashboard to enable auto-propagation",
    };
  }

  try {
    const { projectId, serviceId, environmentId } = await getRailwayIds(projectName, serviceName);

    const res = await fetch(RAILWAY_GQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RAILWAY_TOKEN}`,
      },
      body: JSON.stringify({
        query: `
          mutation VariableUpsert($input: VariableUpsertInput!) {
            variableUpsert(input: $input)
          }
        `,
        variables: {
          input: {
            projectId,
            serviceId,
            environmentId,
            name: varName,
            value,
          },
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return { ok: false, note: `Railway API HTTP error: ${res.status}` };
    const json = await res.json();
    if (json.errors?.length) {
      return { ok: false, note: `Railway GQL error: ${json.errors[0].message}` };
    }
    return { ok: true, note: `Set ${varName} on ${projectName}/${serviceName}` };
  } catch (e: unknown) {
    return { ok: false, note: String(e) };
  }
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

  return NextResponse.json({ credentials: list, railwayReady: !!RAILWAY_TOKEN });
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

  // When rotating the n8n API key itself, use the new value for n8n calls right away
  const n8nKey =
    id === "n8n_api_key"
      ? value
      : (runtimeValues["n8n_api_key"] ?? process.env.N8N_API_KEY ?? "");

  const results: { location: string; ok: boolean; note?: string }[] = [];

  for (const loc of cred.locations) {
    if (loc.type === "manual") {
      results.push({ location: "manual", ok: true, note: (loc as { type: "manual"; note?: string }).note });
      continue;
    }

    if (loc.type === "n8n_code") {
      const n8nLoc = loc as { type: "n8n_code"; workflowId: string; nodeNames: string[] };
      try {
        // Fetch workflow
        const wfRes = await fetch(`${N8N_BASE}/api/v1/workflows/${n8nLoc.workflowId}`, {
          headers: { "X-N8N-API-KEY": n8nKey },
          signal: AbortSignal.timeout(8000),
        });
        if (!wfRes.ok) throw new Error(`Fetch failed: ${wfRes.status}`);
        const wf = await wfRes.json();

        // Replace old value in matching nodes
        let changed = false;
        for (const node of wf.nodes ?? []) {
          if (!n8nLoc.nodeNames.includes(node.name)) continue;
          const code: string = node.parameters?.jsCode ?? "";
          if (!code) continue;
          const updated = replaceKeyInCode(code, id, value);
          if (updated !== code) {
            node.parameters.jsCode = updated;
            changed = true;
          }
        }

        if (!changed) {
          results.push({
            location: `n8n:${n8nLoc.workflowId}`,
            ok: true,
            note: "No matching pattern found in code — may need manual update",
          });
          continue;
        }

        // Push back
        const allowed = [
          "timezone",
          "saveExecutionProgress",
          "saveManualExecutions",
          "saveDataErrorExecution",
          "saveDataSuccessExecution",
          "executionTimeout",
          "errorWorkflow",
          "callerPolicy",
          "executionOrder",
        ];
        const settings = Object.fromEntries(
          Object.entries(wf.settings ?? {}).filter(([k]) => allowed.includes(k))
        );
        const putRes = await fetch(`${N8N_BASE}/api/v1/workflows/${n8nLoc.workflowId}`, {
          method: "PUT",
          headers: { "X-N8N-API-KEY": n8nKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: wf.name,
            nodes: wf.nodes,
            connections: wf.connections,
            settings,
            staticData: wf.staticData,
          }),
          signal: AbortSignal.timeout(10000),
        });
        results.push({
          location: `n8n:${n8nLoc.workflowId}`,
          ok: putRes.ok,
          note: putRes.ok ? "Updated" : `PUT failed: ${putRes.status}`,
        });
      } catch (e: unknown) {
        results.push({ location: `n8n:${n8nLoc.workflowId}`, ok: false, note: String(e) });
      }
    }

    if (loc.type === "railway") {
      const rloc = loc as { type: "railway"; project: string; service: string; varName: string };
      const result = await pushToRailway(rloc.varName, value, rloc.project, rloc.service);
      results.push({ location: `railway:${rloc.varName}`, ...result });
    }
  }

  return NextResponse.json({ ok: true, id, propagated: results });
}

// Replace known credential patterns in JS code strings
function replaceKeyInCode(code: string, credId: string, newValue: string): string {
  const patterns: Record<string, RegExp[]> = {
    instantly_api_key: [/(['"`])MTlj[A-Za-z0-9+/=]{40,}\1/g],
    openrouter_key: [/(['"`])sk-or-v1-[a-f0-9]{60,}\1/g],
    slack_bot_token: [/(['"`])xoxb-[0-9]+-[0-9]+-[A-Za-z0-9]+\1/g],
    telnyx_api_key: [/(['"`])KEY[0-9A-F]{30,}_[A-Za-z0-9]+\1/g],
    n8n_api_key: [
      /(['"`])eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\1/g,
    ],
    ghl_pit_token: [/(['"`])pit-[a-f0-9-]{30,}\1/g],
    shotstack_api_key: [/(['"`])[A-Za-z0-9]{30,}\1(?=.*shotstack|.*SHOTSTACK)/gi],
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
