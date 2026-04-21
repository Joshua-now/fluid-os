import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GHL_TOKEN    = process.env.GHL_PIT_TOKEN ?? "";
const GHL_LOCATION = "zkyEC4YPpQXczjPrdoPb";
const GHL_BASE     = "https://services.leadconnectorhq.com";

async function ghlGet(path: string) {
  const res = await fetch(`${GHL_BASE}${path}`, {
    headers: { "Authorization": `Bearer ${GHL_TOKEN}`, "Version": "2021-07-28" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`GHL ${res.status}: ${path}`);
  return res.json();
}

export async function GET() {
  try {
    const [contactsRes, opportunitiesRes, pipelineStagesRes] = await Promise.allSettled([
      ghlGet(`/contacts/?locationId=${GHL_LOCATION}&limit=100&sortBy=dateAdded&sortOrder=desc`),
      ghlGet(`/opportunities/search?location_id=${GHL_LOCATION}&limit=100`),
      ghlGet(`/opportunities/pipelines?locationId=${GHL_LOCATION}`),
    ]);

    // Leads
    let leads24h = 0, leads7d = 0, leads30d = 0;
    let leadsError: string | null = null;
    if (contactsRes.status === "fulfilled") {
      const contacts = (contactsRes.value.contacts ?? []) as Record<string, string>[];
      const now = Date.now();
      for (const c of contacts) {
        const t = new Date(c.dateAdded ?? c.createdAt ?? 0).getTime();
        const age = now - t;
        if (age < 86_400_000)      leads24h++;
        if (age < 7 * 86_400_000)  leads7d++;
        if (age < 30 * 86_400_000) leads30d++;
      }
    } else {
      leadsError = String(contactsRes.reason);
    }

    // Stage name map from pipelines
    const stageNames: Record<string, string> = {};
    if (pipelineStagesRes.status === "fulfilled") {
      const pipelines = (pipelineStagesRes.value.pipelines ?? []) as Record<string, unknown>[];
      for (const p of pipelines) {
        for (const s of (p.stages as Record<string, string>[]) ?? []) {
          if (s.id && s.name) stageNames[s.id] = s.name;
        }
      }
    }

    // Pipeline
    const stageCounts: Record<string, number> = {};
    let totalValue = 0;
    let oppError: string | null = null;
    if (opportunitiesRes.status === "fulfilled") {
      const opps = (opportunitiesRes.value.opportunities ?? []) as Record<string, unknown>[];
      for (const opp of opps) {
        const stageId = opp.pipelineStageId as string ?? "";
        const stageName = stageNames[stageId] ?? (opp.pipelineStage as Record<string, string>)?.name ?? stageId ?? "Unknown";
        stageCounts[stageName] = (stageCounts[stageName] ?? 0) + 1;
        totalValue += (opp.monetaryValue as number) ?? 0;
      }
    } else {
      oppError = String(opportunitiesRes.reason);
    }

    const bookedCount = Object.entries(stageCounts)
      .filter(([k]) => k.toLowerCase().includes("book"))
      .reduce((s, [, v]) => s + v, 0);
    const conversionRate = leads30d > 0 ? Math.round((bookedCount / leads30d) * 100) : 0;

    return NextResponse.json({
      leads: { today: leads24h, week: leads7d, month: leads30d },
      pipeline: stageCounts,
      totalValue,
      bookedCount,
      conversionRate,
      fetchedAt: new Date().toISOString(),
      errors: { leads: leadsError, opportunities: oppError },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e), fetchedAt: new Date().toISOString() }, { status: 500 });
  }
}
