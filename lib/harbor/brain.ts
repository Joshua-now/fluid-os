/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
/**
 * Harbor — Fluid Productions Founder's AI
 * "Office in a box. Founder's AI partner."
 *
 * Tools:
 *  CRM & Sales      → look_up_contact, log_activity, create_contact, create_opportunity, update_pipeline_stage
 *  Calendar         → check_calendar, create_appointment
 *  Email Marketing  → check_instantly, add_to_campaign, toggle_campaign
 *  Paid Marketing   → check_ad_campaigns, toggle_ad
 *  Research         → research_prospect
 *  Content          → write_content
 *  Automations      → check_n8n, trigger_n8n_workflow, check_guardian_sentinel
 *  Comms            → check_switchboard, check_slack, send_slack_message
 *  Infrastructure   → get_system_status, check_railway
 *  Voice            → make_outbound_call
 *  Memory           → remember, recall
 */

import axios from "axios";
import { Pool } from "pg";

const OPENROUTER_URL  = "https://openrouter.ai/api/v1/chat/completions";
const HARBOR_MODEL    = process.env.BOB_MODEL || "anthropic/claude-sonnet-4-5";
const OLLAMA_BASE     = process.env.RUNPOD_OLLAMA_URL || null;
const OLLAMA_MODEL    = process.env.OLLAMA_MODEL || "llama3.1";

// Simple text generation — prefer Ollama (cheap/fast), fallback to OpenRouter
async function orComplete(messages: any[]): Promise<any> {
  if (OLLAMA_BASE) {
    try {
      const r = await axios.post(
        `${OLLAMA_BASE}/v1/chat/completions`,
        { model: OLLAMA_MODEL, messages, stream: false },
        { headers: { "Content-Type": "application/json" }, timeout: 120000 }
      );
      return r.data;
    } catch {
      // fall through to OpenRouter
    }
  }
  const r = await axios.post(
    OPENROUTER_URL,
    { model: HARBOR_MODEL, messages, max_tokens: 1000, temperature: 0.7 },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.SELF_URL || "https://fluid-os.up.railway.app",
        "X-Title": "Harbor - Fluid OS",
      },
      timeout: 60000,
    }
  );
  return r.data;
}

// ─── DB (for memory) — auto-creates table on first use ───────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let memoryReady = false;
async function ensureMemoryTable() {
  if (memoryReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS harbor_memory (
      id          SERIAL PRIMARY KEY,
      key         TEXT NOT NULL UNIQUE,
      value       TEXT NOT NULL,
      category    TEXT NOT NULL DEFAULT 'other',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS harbor_memory_key_idx ON harbor_memory (key);
  `);
  memoryReady = true;
}

// ─── GHL HELPERS ──────────────────────────────────────────────────────────────
function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_PIT_TOKEN}`,
    "Content-Type": "application/json",
    Version: "2021-07-28",
  };
}

async function ghlSearchContacts(name: string) {
  const r = await axios.get("https://services.leadconnectorhq.com/contacts/search", {
    headers: ghlHeaders(),
    params: { locationId: process.env.GHL_LOCATION_ID, query: name, limit: 5 },
    timeout: 8000,
  });
  return r.data?.contacts || [];
}

async function ghlContactNotes(id: string) {
  const r = await axios.get(`https://services.leadconnectorhq.com/contacts/${id}/notes`, {
    headers: ghlHeaders(),
    timeout: 8000,
  });
  return r.data?.notes || [];
}

async function ghlOpportunities(contactId: string) {
  const r = await axios.get("https://services.leadconnectorhq.com/opportunities/search", {
    headers: ghlHeaders(),
    params: { location_id: process.env.GHL_LOCATION_ID, contact_id: contactId, limit: 5 },
    timeout: 8000,
  });
  return r.data?.opportunities || [];
}

// ─── HARBOR'S TOOL DEFINITIONS ────────────────────────────────────────────────
export const HARBOR_TOOLS = [
  // ── CRM & SALES ──────────────────────────────────────────────────────────────
  {
    name: "look_up_contact",
    description:
      "Look up any person or company in GHL. Returns pipeline stage, recent notes, open deals, and contact info. Use whenever Joshua asks about any person, prospect, or client.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Person or company name" },
      },
      required: ["name"],
    },
  },
  {
    name: "log_activity",
    description:
      "Log a call, demo, meeting, sale, or any activity. Adds a note to their GHL record. Use after Joshua mentions he talked to someone or something happened.",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_name: { type: "string" },
        activity: { type: "string", description: "What happened" },
        outcome: { type: "string", description: "Result — interested, sold, no answer, follow up, etc." },
        amount: { type: "number", description: "Dollar amount if a sale" },
      },
      required: ["contact_name", "activity"],
    },
  },
  {
    name: "create_contact",
    description: "Add a new prospect or client to GHL CRM.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        business_type: { type: "string", description: "HVAC, plumbing, roofing, electrical, etc." },
        notes: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "create_opportunity",
    description: "Create a new sales deal in the GHL pipeline.",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_name: { type: "string" },
        deal_name: { type: "string" },
        value: { type: "number" },
        stage: {
          type: "string",
          description: "New Lead, Demo Scheduled, Proposal Sent, Trial Started, Closed Won, Closed Lost",
        },
      },
      required: ["contact_name", "deal_name"],
    },
  },
  {
    name: "update_pipeline_stage",
    description: "Move a contact to a different stage in the GHL pipeline.",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_name: { type: "string" },
        stage: { type: "string" },
      },
      required: ["contact_name", "stage"],
    },
  },

  // ── CALENDAR ─────────────────────────────────────────────────────────────────
  {
    name: "check_calendar",
    description:
      "Check upcoming appointments and scheduled calls on Joshua's GHL calendar. Can filter by person or return full schedule.",
    input_schema: {
      type: "object" as const,
      properties: {
        days_ahead: { type: "number", description: "How many days ahead to look (default 7)" },
        contact_name: { type: "string", description: "Filter by person name (optional)" },
      },
    },
  },
  {
    name: "create_appointment",
    description: "Book a new appointment or demo call on the GHL calendar.",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_name: { type: "string" },
        title: { type: "string", description: "Appointment title — e.g. 'Speed-to-Lead Demo'" },
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
        time: { type: "string", description: "Time in HH:MM 24h format — e.g. '14:00'" },
        duration_minutes: { type: "number", description: "Length in minutes (default 30)" },
        notes: { type: "string" },
      },
      required: ["contact_name", "title", "date", "time"],
    },
  },

  // ── EMAIL MARKETING (INSTANTLY) ───────────────────────────────────────────────
  {
    name: "check_instantly",
    description:
      "Check Instantly email campaign stats — sent, opened, replied, bounced. Use when Joshua asks about email campaigns or outreach performance.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_name: { type: "string", description: "Filter to specific campaign (optional — leave blank for all)" },
      },
    },
  },
  {
    name: "add_to_campaign",
    description: "Add a lead's email to an Instantly campaign sequence. Use when Joshua wants to add someone to outreach.",
    input_schema: {
      type: "object" as const,
      properties: {
        email: { type: "string" },
        first_name: { type: "string" },
        last_name: { type: "string" },
        company: { type: "string" },
        campaign_name: { type: "string", description: "Partial campaign name to match" },
        custom_variables: {
          type: "object",
          description: "Any merge variables for the sequence — e.g. { city: 'Orlando', service_type: 'HVAC' }",
        },
      },
      required: ["email", "campaign_name"],
    },
  },
  {
    name: "toggle_campaign",
    description: "Pause or resume an Instantly email campaign.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_name: { type: "string", description: "Partial name to match" },
        action: { type: "string", enum: ["pause", "resume"], description: "pause or resume" },
      },
      required: ["campaign_name", "action"],
    },
  },

  // ── PAID MARKETING (META ADS) ─────────────────────────────────────────────────
  {
    name: "check_ad_campaigns",
    description:
      "Check Facebook/Instagram ad campaign performance — spend, impressions, clicks, leads, cost per lead. Use when Joshua asks about ads or paid marketing.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_name: { type: "string", description: "Filter to a specific campaign (optional)" },
        days: { type: "number", description: "How many days back to look (default 7)" },
      },
    },
  },
  {
    name: "toggle_ad",
    description: "Pause or resume a Facebook/Instagram ad campaign or ad set.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_name: { type: "string", description: "Campaign name to match" },
        action: { type: "string", enum: ["pause", "resume"], description: "pause or resume" },
      },
      required: ["campaign_name", "action"],
    },
  },

  // ── RESEARCH & CONTENT ────────────────────────────────────────────────────────
  {
    name: "research_prospect",
    description:
      "Research a contractor business — pulls their website, Google reviews, service area, estimated size, tech stack pain points, and likely objections. Use before a demo or when Joshua wants intel on a prospect.",
    input_schema: {
      type: "object" as const,
      properties: {
        business_name: { type: "string" },
        location: { type: "string", description: "City, state — e.g. 'Orlando, FL'" },
        business_type: { type: "string", description: "HVAC, plumbing, roofing, electrical, etc." },
      },
      required: ["business_name"],
    },
  },
  {
    name: "write_content",
    description:
      "Write any marketing or sales content — cold emails, follow-up sequences, ad copy, landing page sections, LinkedIn posts, proposals, SOWs. Be specific about what it's for.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          description: "cold_email, follow_up_sequence, ad_copy, landing_page, linkedin_post, proposal, sow, sms",
        },
        target_audience: { type: "string", description: "Who it's for — e.g. 'HVAC contractors in Florida'" },
        product: { type: "string", description: "What it's selling — e.g. 'Speed-to-Lead AI'" },
        tone: { type: "string", description: "casual, professional, aggressive, consultative (default: casual but sharp)" },
        context: { type: "string", description: "Any extra context — prospect name, pain point, previous conversation" },
        count: { type: "number", description: "How many variations to write (default 1)" },
      },
      required: ["type", "product"],
    },
  },

  // ── AUTOMATIONS (N8N) ─────────────────────────────────────────────────────────
  {
    name: "check_n8n",
    description:
      "Check n8n automation status — active workflows, recent execution history, failures. Use when Joshua asks about automations or the Campaign Launcher.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "trigger_n8n_workflow",
    description:
      "Restart, activate, or deactivate a specific n8n workflow by name. Use to fix a stuck automation or toggle workflows. Always check_n8n first to confirm the name.",
    input_schema: {
      type: "object" as const,
      properties: {
        workflow_name: {
          type: "string",
          description: "Partial workflow name — e.g. 'Campaign Launcher', 'After Hours', 'Speed to Lead'",
        },
        action: {
          type: "string",
          enum: ["restart", "activate", "deactivate"],
          description: "restart = toggle off then on",
        },
      },
      required: ["workflow_name"],
    },
  },
  {
    name: "check_guardian_sentinel",
    description:
      "Check Guardian and Sentinel — the self-healing AI agents that monitor and fix the automation stack. Shows last run time, status, and any errors.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },

  // ── COMMUNICATIONS ────────────────────────────────────────────────────────────
  {
    name: "check_switchboard",
    description:
      "Check Switchboard AI voice bot status — Anna (Speed-to-Lead) and Maya (After-Hours) bot health, recent call activity.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "check_slack",
    description: "Read recent Slack messages in hand-raises, alerts, or any channel.",
    input_schema: {
      type: "object" as const,
      properties: {
        channel: { type: "string", description: "Channel name or ID (default: hand-raises)" },
      },
    },
  },
  {
    name: "list_slack_channels",
    description: "List all Slack channels in the workspace with their IDs. Use this when SLACK_HAND_RAISES_CHANNEL is wrong or missing — find the correct channel ID and tell Joshua the exact value to set.",
    input_schema: {
      type: "object" as const,
      properties: {
        search: { type: "string", description: "Optional: filter by name (e.g. 'hand-raises', 'alerts')" },
      },
    },
  },
  {
    name: "send_slack_message",
    description: "Send a message to a Slack channel. Use for alerts, summaries, or notifying the team.",
    input_schema: {
      type: "object" as const,
      properties: {
        channel: { type: "string", description: "Channel name or ID" },
        message: { type: "string", description: "Message to send" },
      },
      required: ["channel", "message"],
    },
  },

  // ── INFRASTRUCTURE ────────────────────────────────────────────────────────────
  {
    name: "get_system_status",
    description:
      "Full health check of all systems at once — Switchboard, n8n, Instantly, Slack, Railway services, Guardian/Sentinel. Use when Joshua asks 'how is everything running' or 'give me a status check'.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "check_railway",
    description:
      "Ping every Railway service and report which are online, offline, or slow.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },

  // ── VOICE ─────────────────────────────────────────────────────────────────────
  {
    name: "make_outbound_call",
    description:
      "Place an outbound phone call via Telnyx. Harbor speaks the message when answered. Use for client follow-ups, invoice notifications, or appointment reminders.",
    input_schema: {
      type: "object" as const,
      properties: {
        phone_number: { type: "string", description: "E.164 format — e.g. +14075551234" },
        contact_name: { type: "string" },
        message: { type: "string", description: "What to say when answered. Max 60 words, natural speech." },
      },
      required: ["phone_number", "message"],
    },
  },

  // ── MEMORY ────────────────────────────────────────────────────────────────────
  {
    name: "remember",
    description:
      "Save something to persistent memory — a fact, a deal detail, a preference, a follow-up note. Harbor will remember this across conversations.",
    input_schema: {
      type: "object" as const,
      properties: {
        key: { type: "string", description: "Short label — e.g. 'Mike Johnson deal', 'pricing preference', 'follow up Q3'" },
        value: { type: "string", description: "What to remember — full detail" },
        category: {
          type: "string",
          enum: ["deal", "contact", "preference", "system", "task", "other"],
        },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "recall",
    description: "Search Harbor's memory for anything previously saved. Use when Joshua references something from a past conversation.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "What to look for" },
      },
      required: ["query"],
    },
  },
];

// ─── TOOL EXECUTOR ────────────────────────────────────────────────────────────
export async function executeTool(name: string, input: any): Promise<any> {
  console.log(`[Harbor] Tool: ${name}`, JSON.stringify(input).slice(0, 120));

  switch (name) {

    // ── CRM ───────────────────────────────────────────────────────────────────
    case "look_up_contact": {
      const contacts = await ghlSearchContacts(input.name).catch(() => []);
      if (!contacts.length) return { found: false, message: `Nothing on "${input.name}" in GHL. Want me to add them?` };
      const c = contacts[0];
      const [notes, opps] = await Promise.all([
        ghlContactNotes(c.id).catch(() => []),
        ghlOpportunities(c.id).catch(() => []),
      ]);
      return {
        found: true,
        name: c.name,
        phone: c.phone,
        email: c.email,
        tags: c.tags,
        pipeline_stage: opps[0]?.pipelineStage?.name || "no active deal",
        open_deals: opps.map((o: any) => ({ name: o.name, stage: o.pipelineStage?.name, value: o.monetaryValue })),
        recent_notes: notes.slice(0, 3).map((n: any) => ({ body: n.body, date: n.dateAdded })),
        last_activity: c.dateUpdated,
      };
    }

    case "log_activity": {
      const contacts = await ghlSearchContacts(input.contact_name).catch(() => []);
      const c = contacts[0];
      if (!c) return { success: false, message: `Couldn't find ${input.contact_name} in GHL.` };
      const noteText = [input.activity, input.outcome, input.amount ? `$${input.amount}` : null]
        .filter(Boolean).join(" — ");
      await axios.post(
        `https://services.leadconnectorhq.com/contacts/${c.id}/notes`,
        { body: noteText, userId: process.env.GHL_USER_ID || "" },
        { headers: ghlHeaders(), timeout: 8000 }
      );
      return { success: true, message: `Logged for ${c.name}: ${noteText}` };
    }

    case "create_contact": {
      const body: any = {
        locationId: process.env.GHL_LOCATION_ID,
        firstName: input.name.split(" ")[0],
        lastName: input.name.split(" ").slice(1).join(" ") || "",
        phone: input.phone,
        email: input.email,
        tags: input.business_type ? [input.business_type] : [],
        customField: input.notes ? [{ id: "notes", value: input.notes }] : [],
      };
      const r = await axios.post("https://services.leadconnectorhq.com/contacts/", body, {
        headers: ghlHeaders(),
        timeout: 8000,
      });
      return { success: true, contact_id: r.data?.contact?.id, message: `Created ${input.name} in GHL.` };
    }

    case "create_opportunity": {
      const contacts = await ghlSearchContacts(input.contact_name).catch(() => []);
      const c = contacts[0];
      if (!c) return { success: false, message: `Couldn't find ${input.contact_name} in GHL.` };
      const r = await axios.post(
        "https://services.leadconnectorhq.com/opportunities/",
        {
          locationId: process.env.GHL_LOCATION_ID,
          contactId: c.id,
          name: input.deal_name,
          monetaryValue: input.value || 0,
          pipelineId: process.env.GHL_PIPELINE_ID || "",
          pipelineStageId: process.env.GHL_STAGE_ID || "",
          status: "open",
        },
        { headers: ghlHeaders(), timeout: 8000 }
      );
      return { success: true, opportunity_id: r.data?.opportunity?.id, message: `Created deal "${input.deal_name}" for ${c.name}.` };
    }

    case "update_pipeline_stage": {
      const contacts = await ghlSearchContacts(input.contact_name).catch(() => []);
      const c = contacts[0];
      if (!c) return { success: false, message: `Couldn't find ${input.contact_name}.` };
      const opps = await ghlOpportunities(c.id);
      if (!opps.length) return { success: false, message: `No open deal for ${c.name} to update.` };
      await axios.put(
        `https://services.leadconnectorhq.com/opportunities/${opps[0].id}`,
        { status: input.stage },
        { headers: ghlHeaders(), timeout: 8000 }
      );
      return { success: true, message: `Moved ${c.name} to "${input.stage}".` };
    }

    // ── CALENDAR ──────────────────────────────────────────────────────────────
    case "check_calendar": {
      const daysAhead = input.days_ahead || 7;
      const startTime = new Date().toISOString();
      const endTime = new Date(Date.now() + daysAhead * 86400000).toISOString();
      try {
        const r = await axios.get("https://services.leadconnectorhq.com/calendars/events", {
          headers: ghlHeaders(),
          params: {
            locationId: process.env.GHL_LOCATION_ID,
            startTime,
            endTime,
          },
          timeout: 8000,
        });
        const events = r.data?.events || [];
        const filtered = input.contact_name
          ? events.filter((e: any) => e.title?.toLowerCase().includes(input.contact_name.toLowerCase()))
          : events;
        if (!filtered.length) return { found: false, message: `No appointments in the next ${daysAhead} days.` };
        return {
          found: true,
          count: filtered.length,
          appointments: filtered.slice(0, 10).map((e: any) => ({
            title: e.title,
            start: e.startTime,
            end: e.endTime,
            contact: e.contactName || "No contact linked",
            notes: e.notes,
          })),
        };
      } catch (err: any) {
        return { found: false, error: err.message };
      }
    }

    case "create_appointment": {
      try {
        const contacts = await ghlSearchContacts(input.contact_name).catch(() => []);
        const c = contacts[0];
        const startTime = new Date(`${input.date}T${input.time}:00`).toISOString();
        const endTime = new Date(
          new Date(startTime).getTime() + (input.duration_minutes || 30) * 60000
        ).toISOString();
        const r = await axios.post(
          "https://services.leadconnectorhq.com/calendars/events/appointments",
          {
            locationId: process.env.GHL_LOCATION_ID,
            calendarId: process.env.GHL_CALENDAR_ID || "",
            contactId: c?.id || undefined,
            title: input.title,
            startTime,
            endTime,
            notes: input.notes,
          },
          { headers: ghlHeaders(), timeout: 8000 }
        );
        return { success: true, event_id: r.data?.id, message: `Booked "${input.title}" on ${input.date} at ${input.time}.` };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }

    // ── INSTANTLY ─────────────────────────────────────────────────────────────
    case "check_instantly": {
      try {
        const iHeaders = { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}` };
        const r = await axios.get("https://api.instantly.ai/api/v2/campaigns", {
          headers: iHeaders,
          params: { limit: 20 },
          timeout: 8000,
        });
        // v2 returns { items: [...] }
        let campaigns: any[] = r.data?.items || r.data?.campaigns || (Array.isArray(r.data) ? r.data : []);
        if (!Array.isArray(campaigns)) campaigns = [];
        if (input.campaign_name) {
          campaigns = campaigns.filter((c: any) =>
            c.name?.toLowerCase().includes(input.campaign_name.toLowerCase())
          );
        }
        if (!campaigns.length) return { found: false, message: "No campaigns found." };

        // Fetch analytics for each campaign
        const endDate = new Date().toISOString().split("T")[0];
        const startDate = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];

        const withStats = await Promise.all(
          campaigns.slice(0, 10).map(async (c: any) => {
            try {
              const aR = await axios.get("https://api.instantly.ai/api/v2/analytics", {
                headers: iHeaders,
                params: { campaign_id: c.id, start_date: startDate, end_date: endDate },
                timeout: 8000,
              });
              const a = aR.data || {};
              return {
                name: c.name,
                status: c.status,
                sent: a.emails_sent_count ?? a.contacted_count ?? 0,
                opened: a.open_count ?? a.unique_opens ?? 0,
                replied: a.reply_count ?? a.unique_replies ?? 0,
                open_rate: a.open_rate ? `${(a.open_rate * 100).toFixed(1)}%` : "—",
                reply_rate: a.reply_rate ? `${(a.reply_rate * 100).toFixed(1)}%` : "—",
                leads: a.leads_count ?? c.leads_count ?? 0,
              };
            } catch {
              // Fall back to campaign-level fields if analytics endpoint fails
              return {
                name: c.name,
                status: c.status,
                sent: c.leads_contacted ?? c.contacted_count ?? c.total_leads ?? 0,
                opened: c.open_count ?? 0,
                replied: c.reply_count ?? 0,
                open_rate: "—",
                reply_rate: "—",
                leads: c.total_leads ?? 0,
              };
            }
          })
        );

        return { found: true, count: withStats.length, campaigns: withStats };
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    }

    case "add_to_campaign": {
      try {
        const listR = await axios.get("https://api.instantly.ai/api/v2/campaigns", {
          headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}` },
          params: { limit: 50 },
          timeout: 8000,
        });
        const campaigns = listR.data?.items || listR.data?.campaigns || (Array.isArray(listR.data) ? listR.data : []);
        const campaign = campaigns.find((c: any) =>
          c.name?.toLowerCase().includes(input.campaign_name.toLowerCase())
        );
        if (!campaign) {
          return { success: false, error: `No campaign matching "${input.campaign_name}".`, available: campaigns.map((c: any) => c.name) };
        }
        await axios.post(
          `https://api.instantly.ai/api/v2/campaigns/${campaign.id}/leads`,
          {
            leads: [{
              email: input.email,
              first_name: input.first_name || "",
              last_name: input.last_name || "",
              company_name: input.company || "",
              ...(input.custom_variables || {}),
            }],
          },
          { headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`, "Content-Type": "application/json" }, timeout: 8000 }
        );
        return { success: true, message: `Added ${input.email} to "${campaign.name}".` };
      } catch (err: any) {
        return { success: false, error: err.response?.data?.message || err.message };
      }
    }

    case "toggle_campaign": {
      try {
        const listR = await axios.get("https://api.instantly.ai/api/v2/campaigns", {
          headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}` },
          params: { limit: 50 },
          timeout: 8000,
        });
        const campaigns = listR.data?.items || listR.data?.campaigns || (Array.isArray(listR.data) ? listR.data : []);
        const campaign = campaigns.find((c: any) =>
          c.name?.toLowerCase().includes(input.campaign_name.toLowerCase())
        );
        if (!campaign) return { success: false, error: `No campaign matching "${input.campaign_name}".` };
        const newStatus = input.action === "pause" ? "paused" : "active";
        await axios.patch(
          `https://api.instantly.ai/api/v2/campaigns/${campaign.id}`,
          { status: newStatus },
          { headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`, "Content-Type": "application/json" }, timeout: 8000 }
        );
        return { success: true, message: `"${campaign.name}" is now ${newStatus}.` };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }

    // ── META ADS ──────────────────────────────────────────────────────────────
    case "check_ad_campaigns": {
      const accountId = process.env.META_AD_ACCOUNT_ID;
      const token = process.env.META_ACCESS_TOKEN;
      if (!accountId || !token) return { error: "META_AD_ACCOUNT_ID or META_ACCESS_TOKEN not set." };
      const days = input.days || 7;
      const since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
      const until = new Date().toISOString().split("T")[0];
      try {
        const r = await axios.get(`https://graph.facebook.com/v19.0/act_${accountId}/campaigns`, {
          params: {
            access_token: token,
            fields: "name,status,insights{spend,impressions,clicks,actions}",
            time_range: JSON.stringify({ since, until }),
            limit: 20,
          },
          timeout: 10000,
        });
        let campaigns: any[] = r.data?.data || [];
        if (input.campaign_name) {
          campaigns = campaigns.filter((c: any) =>
            c.name?.toLowerCase().includes(input.campaign_name.toLowerCase())
          );
        }
        return {
          found: true,
          period: `Last ${days} days`,
          campaigns: campaigns.map((c: any) => {
            const ins = c.insights?.data?.[0] || {};
            const leads = (ins.actions || []).find((a: any) => a.action_type === "lead")?.value || 0;
            return {
              name: c.name,
              status: c.status,
              spend: `$${parseFloat(ins.spend || "0").toFixed(2)}`,
              impressions: ins.impressions || 0,
              clicks: ins.clicks || 0,
              leads,
              cpl: leads > 0 ? `$${(parseFloat(ins.spend || "0") / leads).toFixed(2)}` : "—",
            };
          }),
        };
      } catch (err: any) {
        return { error: err.response?.data?.error?.message || err.message };
      }
    }

    case "toggle_ad": {
      const accountId = process.env.META_AD_ACCOUNT_ID;
      const token = process.env.META_ACCESS_TOKEN;
      if (!accountId || !token) return { error: "META credentials not set." };
      try {
        const listR = await axios.get(`https://graph.facebook.com/v19.0/act_${accountId}/campaigns`, {
          params: { access_token: token, fields: "name,status", limit: 50 },
          timeout: 10000,
        });
        const campaigns: any[] = listR.data?.data || [];
        const campaign = campaigns.find((c: any) =>
          c.name?.toLowerCase().includes(input.campaign_name.toLowerCase())
        );
        if (!campaign) return { success: false, error: `No campaign matching "${input.campaign_name}".` };
        const newStatus = input.action === "pause" ? "PAUSED" : "ACTIVE";
        await axios.post(
          `https://graph.facebook.com/v19.0/${campaign.id}`,
          { status: newStatus, access_token: token },
          { timeout: 8000 }
        );
        return { success: true, message: `"${campaign.name}" is now ${newStatus}.` };
      } catch (err: any) {
        return { success: false, error: err.response?.data?.error?.message || err.message };
      }
    }

    // ── RESEARCH & CONTENT ────────────────────────────────────────────────────
    case "research_prospect": {
      const prompt = `You are a sales researcher. Create a concise intelligence brief on this business:

Business: ${input.business_name}
Location: ${input.location || "unknown"}
Type: ${input.business_type || "home service contractor"}

Based on your knowledge, provide:
1. Likely business size (employees, trucks)
2. Common tech stack pain points for this type of contractor
3. Speed-to-lead relevance (do they miss calls? After-hours issues?)
4. Key objections to expect
5. Best angle for the pitch

Keep it punchy — this is a pre-call brief, not an essay. 3-4 sentences per section max.`;

      const r = await orComplete([{ role: "user", content: prompt }]);
      const brief = r.choices?.[0]?.message?.content || "";
      return { business: input.business_name, brief };
    }

    case "write_content": {
      const toneMap: Record<string, string> = {
        casual: "casual, conversational, sounds like a real person — no corporate fluff",
        professional: "professional and polished",
        aggressive: "direct and bold — gets to the point fast, no fluff",
        consultative: "consultative and empathetic — asks questions, builds trust",
      };
      const tone = toneMap[input.tone] || toneMap.casual;
      const count = input.count || 1;

      const typeInstructions: Record<string, string> = {
        cold_email: `Write ${count} cold email(s). Each needs: subject line, opening hook (no 'I hope this email finds you well'), value prop, soft CTA. Max 120 words per email.`,
        follow_up_sequence: `Write a ${count > 1 ? count + "-email" : "3-email"} follow-up sequence. Day 1, Day 3, Day 7. Each email should be shorter and punchier than the last.`,
        ad_copy: `Write ${count} Facebook/Instagram ad variation(s). Each: headline (max 40 chars), primary text (max 125 chars), description (max 30 chars).`,
        landing_page: `Write landing page copy: hero headline, sub-headline, 3 benefit bullets, social proof blurb, and CTA button text.`,
        linkedin_post: `Write ${count} LinkedIn post(s). Hook in first line (no question), value in middle, soft CTA at end. Max 200 words.`,
        proposal: `Write a professional proposal outline with: executive summary, problem statement, proposed solution, deliverables, timeline, and pricing placeholder.`,
        sow: `Write a Statement of Work with: scope, deliverables, timeline, responsibilities, payment terms placeholder, and acceptance criteria.`,
        sms: `Write ${count} SMS follow-up(s). Max 160 chars each. Conversational. Include first name merge tag {{first_name}}.`,
      };

      const instruction = typeInstructions[input.type] || `Write ${count} piece(s) of ${input.type} content.`;

      const prompt = `You are a conversion copywriter for Fluid Productions, an AI automation company for home service contractors.

Product: ${input.product}
Target: ${input.target_audience || "home service contractors"}
Tone: ${tone}
${input.context ? `Context: ${input.context}` : ""}

Task: ${instruction}

Write clean copy only — no meta-commentary, no "here's a version...", just the content itself.`;

      const r = await orComplete([{ role: "user", content: prompt }]);
      const content = r.choices?.[0]?.message?.content || "";
      return { type: input.type, content };
    }

    // ── N8N ───────────────────────────────────────────────────────────────────
    case "check_n8n": {
      const headers = { "X-N8N-API-KEY": process.env.N8N_API_KEY || "" };
      const base = process.env.N8N_BASE_URL;
      try {
        const [wfR, exR] = await Promise.all([
          axios.get(`${base}/api/v1/workflows`, { headers, params: { limit: 20 }, timeout: 8000 }),
          axios.get(`${base}/api/v1/executions`, { headers, params: { limit: 10 }, timeout: 8000 }).catch(() => ({ data: { data: [] } })),
        ]);
        const workflows = wfR.data?.data || [];
        const executions = exR.data?.data || [];
        const failed = executions.filter((e: any) => e.status === "error");
        return {
          ok: true,
          active: workflows.filter((w: any) => w.active).length,
          total: workflows.length,
          workflows: workflows.map((w: any) => ({ name: w.name, active: w.active })),
          recent_failures: failed.slice(0, 3).map((e: any) => ({
            workflow: e.workflowData?.name,
            error: e.data?.resultData?.error?.message,
            at: e.startedAt,
          })),
        };
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    }

    case "trigger_n8n_workflow": {
      const base = process.env.N8N_BASE_URL;
      const apiKey = process.env.N8N_API_KEY;
      if (!base) return { ok: false, error: "N8N_BASE_URL not set in environment. Add it to Railway fluid-os service variables." };
      if (!apiKey) return { ok: false, error: "N8N_API_KEY not set in environment. Add it to Railway fluid-os service variables." };
      const headers = { "X-N8N-API-KEY": apiKey };

      let workflows: any[] = [];
      try {
        const listR = await axios.get(`${base}/api/v1/workflows`, { headers, params: { limit: 50 }, timeout: 8000 });
        workflows = listR.data?.data || [];
      } catch (err: any) {
        return { ok: false, error: `Could not reach n8n at ${base}: ${err.message}. Check N8N_BASE_URL is correct and n8n is running.` };
      }

      const match = workflows.find((w: any) =>
        w.name.toLowerCase().includes(input.workflow_name.toLowerCase())
      );
      if (!match) return { ok: false, error: `No workflow matching "${input.workflow_name}".`, available: workflows.map((w: any) => w.name) };

      const action = input.action || "restart";

      async function setActive(id: string, active: boolean) {
        // Try newer PATCH pattern first, fall back to PUT activate/deactivate
        try {
          await axios.patch(`${base}/api/v1/workflows/${id}`, { active }, { headers, timeout: 8000 });
        } catch {
          const path = active ? "activate" : "deactivate";
          await axios.put(`${base}/api/v1/workflows/${id}/${path}`, {}, { headers, timeout: 8000 });
        }
      }

      try {
        if (action === "activate") {
          await setActive(match.id, true);
          return { ok: true, message: `✅ "${match.name}" activated.` };
        }
        if (action === "deactivate") {
          await setActive(match.id, false);
          return { ok: true, message: `⏸ "${match.name}" deactivated.` };
        }
        // restart = deactivate then activate
        await setActive(match.id, false);
        await new Promise((r) => setTimeout(r, 800));
        await setActive(match.id, true);
        return { ok: true, message: `🔄 "${match.name}" restarted successfully.` };
      } catch (err: any) {
        return { ok: false, error: `Restart blocked: ${err.response?.data?.message || err.message}. Workflow: "${match.name}". This may need manual toggle in the n8n dashboard at ${base}.`, workflow: match.name };
      }
    }

    case "check_guardian_sentinel": {
      try {
        const headers = { "X-N8N-API-KEY": process.env.N8N_API_KEY || "" };
        const exR = await axios.get(`${process.env.N8N_BASE_URL}/api/v1/executions`, {
          headers,
          params: { limit: 50 },
          timeout: 10000,
        });
        const all = exR.data?.data || [];
        const runs = all.filter((e: any) => {
          const n = (e.workflowData?.name || "").toLowerCase();
          return n.includes("guardian") || n.includes("sentinel");
        });
        if (!runs.length) return { found: false, message: "No Guardian or Sentinel executions found recently." };
        return {
          found: true,
          total_runs: runs.length,
          runs: runs.slice(0, 6).map((e: any) => ({
            agent: e.workflowData?.name,
            status: e.status,
            started: e.startedAt,
            duration: e.stoppedAt && e.startedAt
              ? `${((new Date(e.stoppedAt).getTime() - new Date(e.startedAt).getTime()) / 1000).toFixed(1)}s`
              : "—",
            error: e.status === "error" ? e.data?.resultData?.error?.message : null,
          })),
          last_success: runs.find((e: any) => e.status === "success")?.startedAt || "None found",
        };
      } catch (err: any) {
        return { error: err.message };
      }
    }

    // ── COMMUNICATIONS ────────────────────────────────────────────────────────
    case "check_switchboard": {
      const base = process.env.SWITCHBOARD_URL;
      const headers = { Authorization: `Bearer ${process.env.SWITCHBOARD_API_KEY}` };
      try {
        const r = await axios.get(`${base}/api/status`, { headers, timeout: 8000 }).catch(() =>
          axios.get(`${base}/health`, { timeout: 5000 })
        );
        return { ok: true, data: r.data };
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    }

    case "check_slack": {
      const token = process.env.SLACK_BOT_TOKEN;
      if (!token) return { ok: false, error: "SLACK_BOT_TOKEN not set in fluid-os Railway variables. Add it now." };
      const channel = input.channel || process.env.SLACK_HAND_RAISES_CHANNEL || "hand-raises";
      try {
        const r = await axios.get("https://slack.com/api/conversations.history", {
          headers: { Authorization: `Bearer ${token}` },
          params: { channel, limit: 10 },
          timeout: 8000,
        });
        if (!r.data?.ok) {
          const errCode = r.data?.error;
          // On channel errors, auto-lookup available channels so we can give the exact fix
          if (["channel_not_found", "not_in_channel"].includes(errCode)) {
            try {
              const listR = await axios.get("https://slack.com/api/conversations.list", {
                headers: { Authorization: `Bearer ${token}` },
                params: { limit: 200, types: "public_channel,private_channel" },
                timeout: 8000,
              });
              if (listR.data?.ok) {
                const channels = listR.data.channels || [];
                // find likely matches
                const matches = channels.filter((c: any) =>
                  ["hand-raises", "hand_raises", "alerts", "harbor", "leads", "general"].some(n =>
                    c.name?.toLowerCase().includes(n)
                  )
                );
                const allNames = channels.slice(0, 30).map((c: any) => `#${c.name} → ${c.id}`);
                if (errCode === "not_in_channel") {
                  const ch = channels.find((c: any) => c.id === channel || c.name === channel);
                  return { ok: false, error: `Bot is not in channel "${channel}". Fix: go to that channel in Slack and type /invite @Harbor`, channel_id: ch?.id };
                }
                return {
                  ok: false,
                  error: `Channel "${channel}" not found. SLACK_HAND_RAISES_CHANNEL env var is wrong.`,
                  fix: `Go to Railway → fluid-os → Variables → set SLACK_HAND_RAISES_CHANNEL to one of these IDs:`,
                  likely_matches: matches.map((c: any) => `#${c.name} → ID: ${c.id}`),
                  all_channels: allNames,
                };
              }
            } catch { /* ignore lookup failure */ }
            return { ok: false, error: `${errCode}: Channel "${channel}" not found. Check SLACK_HAND_RAISES_CHANNEL in Railway — value should be a channel ID starting with C, not a channel name.` };
          }
          if (errCode === "missing_scope") return { ok: false, error: "missing_scope: Bot token is missing channels:history / groups:history scope. Fix: api.slack.com/apps → Harbor app → OAuth & Permissions → add channels:history → reinstall app." };
          if (errCode === "invalid_auth") return { ok: false, error: "invalid_auth: SLACK_BOT_TOKEN is invalid or revoked. Fix: api.slack.com/apps → Harbor app → OAuth & Permissions → copy Bot User OAuth Token (xoxb-...) → update Railway variable." };
          return { ok: false, error: errCode };
        }
        return {
          ok: true,
          messages: (r.data.messages || []).map((m: any) => ({
            text: m.text,
            ts: new Date(parseFloat(m.ts) * 1000).toLocaleString(),
          })),
        };
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    }

    case "list_slack_channels": {
      const token = process.env.SLACK_BOT_TOKEN;
      if (!token) return { ok: false, error: "SLACK_BOT_TOKEN not set in fluid-os Railway variables." };
      try {
        const r = await axios.get("https://slack.com/api/conversations.list", {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit: 200, types: "public_channel,private_channel" },
          timeout: 8000,
        });
        if (!r.data?.ok) {
          const errCode = r.data?.error;
          let hint = "";
          if (errCode === "missing_scope") hint = " — Add channels:read and groups:read scopes to the Harbor Slack app at api.slack.com/apps → OAuth & Permissions, then reinstall.";
          return { ok: false, error: errCode + hint };
        }
        let channels = r.data.channels || [];
        if (input.search) {
          channels = channels.filter((c: any) => c.name?.toLowerCase().includes(input.search.toLowerCase()));
        }
        return {
          ok: true,
          channels: channels.slice(0, 50).map((c: any) => ({
            name: `#${c.name}`,
            id: c.id,
            is_private: c.is_private,
            members: c.num_members,
          })),
          hint: "Use the 'id' value (starts with C) for SLACK_HAND_RAISES_CHANNEL in Railway.",
        };
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    }

    case "send_slack_message": {
      try {
        const r = await axios.post(
          "https://slack.com/api/chat.postMessage",
          { channel: input.channel, text: input.message },
          { headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`, "Content-Type": "application/json" }, timeout: 8000 }
        );
        return { ok: r.data?.ok, ts: r.data?.ts, error: r.data?.error };
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    }

    // ── INFRASTRUCTURE ────────────────────────────────────────────────────────
    case "get_system_status": {
      const [n8n, instantly, switchboard, slack] = await Promise.all([
        executeTool("check_n8n", {}),
        executeTool("check_instantly", {}),
        executeTool("check_switchboard", {}),
        executeTool("check_slack", {}),
      ]);
      return { n8n, instantly, switchboard, slack };
    }

    case "check_railway": {
      const SERVICES = [
        { name: "n8n", url: `${process.env.N8N_BASE_URL}/healthz` },
        { name: "Switchboard", url: `${process.env.SWITCHBOARD_URL}/health` },
        { name: "FluidOS", url: `${process.env.SELF_URL}/api/harbor/status` },
      ].filter((s) => s.url);

      const results = await Promise.all(
        SERVICES.map(async ({ name, url }) => {
          const start = Date.now();
          try {
            const r = await axios.get(url, { timeout: 7000 });
            return { name, status: "online", latencyMs: Date.now() - start, http: r.status };
          } catch (err: any) {
            if (err.response && [401, 403, 404].includes(err.response.status)) {
              return { name, status: "online (auth wall)", latencyMs: Date.now() - start, http: err.response.status };
            }
            return { name, status: "offline", latencyMs: Date.now() - start, error: err.message };
          }
        })
      );
      return { services: results };
    }

    // ── VOICE ─────────────────────────────────────────────────────────────────
    case "make_outbound_call": {
      try {
        const r = await axios.post(
          "https://api.telnyx.com/v2/calls",
          {
            connection_id: process.env.TELNYX_CONNECTION_ID,
            from: process.env.TELNYX_PHONE_NUMBER || "+13214657132",
            to: input.phone_number,
            client_state: Buffer.from(
              JSON.stringify({ message: input.message, contact: input.contact_name })
            ).toString("base64"),
            webhook_url: `${process.env.SELF_URL}/api/harbor/voice`,
          },
          {
            headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` },
            timeout: 10000,
          }
        );
        return { success: true, call_id: r.data?.data?.call_control_id, message: `Calling ${input.phone_number}...` };
      } catch (err: any) {
        return { success: false, error: err.response?.data?.errors?.[0]?.detail || err.message };
      }
    }

    // ── MEMORY ────────────────────────────────────────────────────────────────
    case "remember": {
      try {
        await ensureMemoryTable();
        await pool.query(
          `INSERT INTO harbor_memory (key, value, category, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (key) DO UPDATE SET value = $2, category = $3, updated_at = NOW()`,
          [input.key, input.value, input.category || "other"]
        );
        return { success: true, message: `Got it — saved "${input.key}".` };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }

    case "recall": {
      try {
        await ensureMemoryTable();
        const r = await pool.query(
          `SELECT key, value, category, updated_at FROM harbor_memory
           WHERE key ILIKE $1 OR value ILIKE $1
           ORDER BY updated_at DESC LIMIT 10`,
          [`%${input.query}%`]
        );
        if (!r.rows.length) return { found: false, message: `Nothing in memory matching "${input.query}".` };
        return { found: true, memories: r.rows };
      } catch (err: any) {
        return { found: false, error: err.message };
      }
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── KNOWLEDGE LOADER ────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";

function loadKnowledge(): string {
  const dir = path.join(process.cwd(), "lib/harbor/knowledge");
  const files = [
    { label: "WHO JOSHUA IS", file: "joshua.md" },
    { label: "FLUID PRODUCTIONS — BUSINESS", file: "business.md" },
    { label: "THE AUTONOMOUS STACK", file: "system.md" },
  ];
  return files.map(({ label, file }) => {
    try {
      const text = fs.readFileSync(path.join(dir, file), "utf8").trim();
      return `=== ${label} ===\n${text}`;
    } catch {
      return `=== ${label} ===\n(not found)`;
    }
  }).join("\n\n");
}

const KNOWLEDGE = loadKnowledge();

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
export const HARBOR_SYSTEM_PROMPT = `You are Harbor — the autonomous AI operator running Fluid Productions.

CRITICAL: You are not an assistant. You are not a middleman. You do not have a "tech team." You do not know anyone named Troy in a way that is relevant to system fixes — that name appears in email routing context only. Joshua Brown is the ONLY human you answer to. When something breaks, YOU fix it. Full stop.

YOUR JOB IN ONE SENTENCE:
Monitor every system, fix every problem, drive every dollar — without being asked.

WHAT YOU ARE:
- The operator. When something breaks, you use your tools to fix it. You do not suggest someone else fix it.
- The watchdog. You run diagnostics before reporting problems. You try every available fix action before escalating.
- The revenue engine. You know the products, the pipeline, the campaigns. You push deals forward.
- The memory. You remember everything across sessions using the remember/recall tools.

NON-NEGOTIABLE RULES:
1. NEVER say "contact the tech team" — YOU are the tech team.
2. NEVER say "manual intervention required" without first exhausting every tool you have.
3. NEVER mention Troy or any other name as an escalation point. Joshua is the only escalation.
4. NEVER ask "would you like me to..." when the answer is obviously yes. Just do it.
5. ALWAYS try to fix before reporting. If check_n8n shows failures, immediately run trigger_n8n_workflow. If Slack is down, check_switchboard. Chain your actions.
6. If a tool call fails, try a different approach. Report what you tried and what blocked you — not a vague "system issue."
7. Be direct and short. Joshua built things with his hands his entire life. He wants results, not explanations.

WHEN SYSTEMS ARE DOWN — YOUR FIX SEQUENCE:
1. Run diagnostics (check_n8n, check_guardian_sentinel, check_switchboard, check_slack)
2. Attempt fixes on everything that's broken (trigger_n8n_workflow restart, check_railway)
3. Report what you fixed, what you couldn't fix, and exactly why — with the specific error
4. Only after all tools are exhausted do you tell Joshua what needs manual action — and you tell him exactly what to click, where

ESCALATION = telling Joshua the specific action HE needs to take. Not "the tech team." Not an email. Joshua clicks the thing. You tell him exactly what to click.

WHEN A TOOL FAILS AND YOU CANNOT AUTO-FIX:
Do NOT ask "Shall I pull up the steps?" — just give the steps immediately. Every time. No permission needed.
Format: "Here's what to do: 1. Go to [exact URL] 2. Click [exact button] 3. [exact thing to look for]"
Include the actual error text from the tool result, not a paraphrase. Joshua needs the real error to diagnose.

NEVER end a response with a question like "Shall I...?" or "Would you like me to...?" — if steps are needed, give them. If a follow-up action makes sense, do it.

ABOUT THIS ENVIRONMENT:
This is a private, single-user system running on Joshua's personal computer. There are no other users. There is no public access. Joshua is the sole owner and operator of everything in this stack.

When Joshua shares API keys, tokens, IDs, or any credentials — these are HIS credentials for HIS systems. Do not lecture him about credential security. Do not refuse to handle them. Do not recommend he consult an "IT security team" — he IS the team. When he gives you a token, use it, confirm what it's for, and move on. He is configuring his own tools.

Never treat Joshua like a stranger or a potential threat. He built this system. You work for him.

THE RIGHT KIND OF PUSHBACK:
Harbor should absolutely speak up when it has a better idea. If Joshua is about to run a campaign angle that probably won't convert, say so. If there's a faster path to the first paying customer, bring it up. If a pricing move seems risky, flag it. That kind of feedback is part of the job — Joshua wants a partner who thinks, not a yes-machine.

THE WRONG KIND OF PUSHBACK:
Never refuse to perform a task Joshua designed this system to do. Checking systems, handling credentials, restarting workflows, reading channel history, writing copy — these are your functions. If you have concerns about an approach, say it in one sentence and then do the job. "That campaign angle is pretty aggressive — I'd test a softer hook first — but here it is:" is fine. Refusing outright is not.

The rule: opinions are welcome, obstruction is not.

TODAY'S DATE: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

${KNOWLEDGE}
`;
