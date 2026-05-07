// Central credential registry
// Each entry describes one API key / token in the system.
// `expiresAt` is ISO date string â null means no known expiry.
// `locations` tells the propagation API where to push updates.

export type CredLocation =
  | { type: "railway"; project: string; service: string; varName: string }
  | { type: "n8n_code"; workflowId: string; nodeNames: string[] }
  | { type: "n8n_credential"; credentialId: string; credentialType: string; dataKey: string }
  | { type: "manual"; note: string };

export interface Credential {
  id: string;
  name: string;
  service: string;
  description: string;
  expiresAt: string | null;   // ISO date or null
  locations: CredLocation[];
}

export const CREDENTIALS: Credential[] = [
  {
    id: "instantly_api_key",
    name: "Instantly API Key",
    service: "Instantly",
    description: "Used for sending campaigns and reading replies",
    expiresAt: null,
    locations: [
      { type: "n8n_code", workflowId: "e1q4gxLtQyZJFHtd", nodeNames: ["Get Instantly Stats", "Health Pings", "Code in JavaScript"] },
      { type: "n8n_code", workflowId: "C9YowwYlqUnOONzm", nodeNames: ["Poll Instantly"] },
      { type: "n8n_code", workflowId: "0OMTtBDlELNU3xbJ", nodeNames: ["Watch + Diagnose + Alert"] },
      { type: "manual", note: "Also hardcoded in n8n Outbound Lead Qualifier" },
    ],
  },
  {
    id: "openrouter_key",
    name: "OpenRouter API Key",
    service: "OpenRouter",
    description: "Powers Claude LLM calls for reply writing and AI ops agent",
    expiresAt: null,
    locations: [
      { type: "n8n_code", workflowId: "lFm6wiwlgOalsqRr", nodeNames: ["Write Hot Reply", "Write Warm Reply"] },
      { type: "n8n_code", workflowId: "0OMTtBDlELNU3xbJ", nodeNames: ["Watch + Diagnose + Alert"] },
      { type: "railway", project: "exquisite-wisdom", service: "web", varName: "OPENROUTER_API_KEY" },
    ],
  },
  {
    id: "shotstack_api_key",
    name: "Shotstack API Key",
    service: "Shotstack",
    description: "Renders video in the video shorts flywheel",
    expiresAt: null,
    locations: [
      { type: "railway", project: "exquisite-wisdom", service: "web", varName: "SHOTSTACK_API_KEY" },
    ],
  },
  {
    id: "slack_bot_token",
    name: "Slack Bot Token",
    service: "Slack",
    description: "Posts alerts, digests, and approval messages",
    expiresAt: null,
    locations: [
      { type: "n8n_code", workflowId: "8mEhCsE7SzRU8LoZ", nodeNames: ["Build & Send Digest"] },
      { type: "n8n_code", workflowId: "e1q4gxLtQyZJFHtd", nodeNames: ["Health Pings", "Build Report"] },
      { type: "n8n_code", workflowId: "0OMTtBDlELNU3xbJ", nodeNames: ["Watch + Diagnose + Alert"] },
      { type: "railway", project: "exquisite-wisdom", service: "web", varName: "SLACK_BOT_TOKEN" },
    ],
  },
  {
    id: "telnyx_api_key",
    name: "Telnyx API Key",
    service: "Telnyx",
    description: "Powers AI calling bots (Anna, Maya, Riley)",
    expiresAt: null,
    locations: [
      { type: "n8n_code", workflowId: "e1q4gxLtQyZJFHtd", nodeNames: ["Health Pings", "Initiate Morning Call"] },
      { type: "n8n_code", workflowId: "jyLvOG7Uu2c5KoHC", nodeNames: ["Handle Call Event"] },
      { type: "manual", note: "Also in Switchboard V5 Railway env: TELNYX_API_KEY" },
    ],
  },
  {
    id: "n8n_api_key",
    name: "n8n API Key",
    service: "n8n",
    description: "Used by FluidOS health checks and workflow patching",
        expiresAt: null,
    locations: [
      { type: "manual", note: "Regenerate at n8n Settings â API. Update fluid-os env var N8N_API_KEY and all hardcoded workflow nodes." },
    ],
  },
  {
    id: "r2_access_key",
    name: "R2 Access Key ID",
    service: "Cloudflare R2",
    description: "Stores audio and video files for the video pipeline",
    expiresAt: null,
    locations: [
      { type: "railway", project: "exquisite-wisdom", service: "web", varName: "R2_ACCESS_KEY_ID" },
    ],
  },
  {
    id: "r2_secret_key",
    name: "R2 Secret Access Key",
    service: "Cloudflare R2",
    description: "Secret for R2 storage access",
    expiresAt: null,
    locations: [
      { type: "railway", project: "exquisite-wisdom", service: "web", varName: "R2_SECRET_ACCESS_KEY" },
    ],
  },
  {
    id: "ghl_pit_token",
    name: "GHL PIT Token",
    service: "GoHighLevel",
    description: "Creates contacts and updates pipeline in GHL",
    expiresAt: null,
    locations: [
      { type: "railway", project: "fluid-os", service: "n8n-production-5955", varName: "GHL_PIT_TOKEN" },
      { type: "manual", note: "Code nodes now read process.env.GHL_PIT_TOKEN. Also update the GHL credential on the HTTP Request node for Create GHL Opportunity in Reply Handler." },
    ],
  },
];

// Helper: days until expiry (negative = already expired)
export function daysUntilExpiry(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function expiryStatus(days: number | null): "ok" | "warning" | "critical" | "unknown" {
  if (days === null) return "unknown";
  if (days < 0) return "critical";
  if (days <= 14) return "warning";
  return "ok";
}
