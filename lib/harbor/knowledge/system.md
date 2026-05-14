# Fluid Productions — Autonomous Operations Stack

## Overview
Fluid Productions runs a fully autonomous AI-driven marketing and sales operation. Every lead that enters the system is contacted, qualified, nurtured, and either converted or gracefully exited — with zero manual intervention unless truly needed. When any part of the stack breaks, the system detects it, diagnoses it, and fixes itself, escalating to Joshua only when it can't resolve it alone.

## Layer 1: Lead Generation — Instantly AI
Cold email outreach targeting contractor segments. Mon–Fri 9AM–5/6PM ET schedule. 4 sending accounts, all 96–100% domain health. Replies polled every 15 minutes by the Reply Poller.

**Reply Intelligence (AI-powered):**
- Interested replies → Harbor flags Joshua immediately via Slack and logs them in GHL pipeline
- Objections → AI generates context-aware rebuttal for Joshua's review
- Unsubscribes → auto-added to suppression list, removed from sequence
- Out of office → held for follow-up

## Layer 2: CRM & Pipeline — GoHighLevel
Pipeline: New Lead → Contacted → Qualified → Appointment Booked → Closed
Anna (AI booking agent via Switchboard) handles appointment scheduling autonomously. Contacts that stop responding are flagged by the Sentinel Watchdog.

**Sentinel Contact Recovery:** When a contact is stuck in a pipeline stage for 24+ hours, it's auto-tagged `sentinel-recovery`, triggering a GHL recovery workflow.

## Layer 3: Phone & Voice — Telnyx + Switchboard V5
Telnyx handles carrier infrastructure. Switchboard V5 is the intelligent routing and management layer.

**Switchboard Capabilities:**
- Routes inbound calls by time of day, lead status, and campaign
- Manages outbound call scheduling via Telnyx TTS for morning call handler
- Tracks all call state in Postgres: QUEUED → IN_PROGRESS → COMPLETED
- Hosts Anna (AI appointment booking agent)
- Admin endpoints secured by watchdog secret
- Self-heals stuck calls automatically (calls stuck IN_PROGRESS get cleaned up)

**AI Bots:**
- Anna — Speed-to-Lead inbound handler, books appointments autonomously
- Maya — After-Hours receptionist

## Layer 4: Video Content Flywheel
Fully automated Mon/Wed/Fri 9AM ET. No human involvement required unless content needs approval. Social Posts also run Tue/Thu 10AM, pushing approved content to Slack. Facebook Content Engine handles Facebook repurposing and posting.

## Layer 5: Automation Backbone — n8n + Langflow
76 active n8n workflows coordinate every moving part. Langflow hosts AI agents for intelligence and decision-making.

## Layer 6: Self-Healing — Guardian + Sentinel

**Guardian Agent (Reactive):**
Every n8n workflow is wired to the Guardian Error Catcher. When any workflow fails:
1. `retry_workflow` — re-runs the failed execution
2. `restart_workflow` — deactivates and reactivates to clear bad state
3. `clear_stuck_calls` — fires Switchboard cleanup endpoint
4. `resume_instantly_campaign` — resumes a paused campaign
5. `escalate_to_slack` — sends detailed alert when human judgment is needed

**Sentinel Watchdog (Proactive):**
Patrols the entire stack every 10 minutes looking for problems before they cause failures. Flags contacts stuck in pipeline, monitors workflow health, checks call states.

## Layer 7: FluidOS Command Center
Custom-built web dashboard (this app). Single pane of glass over the entire operation. Hosted on Railway. Modules: Harbor (this AI), Bob (business AI), system status, daily reports.

**Daily Reports:**
- 7:30AM Slack Digest — overnight summary: calls handled, replies received, leads queued, health status
- 5PM Evening Report — full day recap across campaigns, pipeline, phone, and content
- Morning Call Handler — TTS-powered briefing delivered via Telnyx

## A Lead's Complete Journey (Zero Human Involvement)
1. Lead uploaded to Instantly AI campaign
2. Personalized outreach sent on schedule
3. If interested reply → AI Reply Handler routes to live conversation or books via Anna
4. Contact moved to GHL pipeline
5. If goes quiet → Sentinel detects after 24h → recovery workflow fires
6. If still no response after 48h → escalated to Joshua via Slack
7. If any workflow crashes mid-sequence → Guardian catches it, retries, fixes, or escalates

**The promise:** No lead goes unread. No journey stalls. No failure goes unnoticed.
