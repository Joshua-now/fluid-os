# FluidOS System State

## Infrastructure
- **Repo**: `Joshua-now/fluid-os` (GitHub)
- **Deploy**: Railway (auto-deploy on push to main)
- **URL**: `fluid-os.aiteammate.io`
- **Stack**: Next.js 14 App Router, Tailwind CSS, Railway hosting

## GitHub Access
- **Classic PAT**: `ghp_sTVzY5... (see vault at /vault, or Joshua has it saved)`
- **Name**: "fluid-os deploy"
- **Scope**: `repo` (full), no expiration
- Use GitHub Contents API (`PUT /repos/Joshua-now/fluid-os/contents/{path}`) to push files

## Pages / Routes
| Route | File | Description |
|-------|------|-------------|
| `/` | `components/FluidOS.tsx` | Main FluidOS dashboard |
| `/metrics` | `app/metrics/page.tsx` | GHL metrics dashboard (live as of 2026-04-21) |
| `/api/metrics` | `app/api/metrics/route.ts` | Server route — fetches GHL data |
| `/vault` | — | Credential vault (password: BobDog11) |

## GHL Integration (in /api/metrics)
- **Token env var**: `GHL_PIT_TOKEN`
- **Location ID**: `zkyEC4YPpQXczjPrdoPb`
- **Base URL**: `https://services.leadconnectorhq.com`
- **API Version header**: `2021-07-28`
- Fetches: contacts (leads), opportunities (pipeline), pipeline stages

## n8n Platform
- Hosted on Railway (n8n 2.x): `n8n-production-5955.up.railway.app`
- `n8n-nodes-base.anthropic` NOT installed — use httpRequest to Anthropic API
- Slack nodes unreliable — use httpRequest to `slack.com/api/chat.postMessage`
- All API responses wrapped in `{ data: {...} }` — unwrap with `body.data || body`
- Activation requires `versionId` — always GET workflow first
- Use PATCH (not PUT) for workflow updates

## Key n8n Workflows (8 critical, all ACTIVE)
- **FluidOS Watchdog Agent** (`JPg0lqg2e9JKEfxI`) — runs every 15 min, monitors all workflows, auto-fixes, posts to Slack
- **Old Bot Watchdog** (`MPTYTUwdQkf2wfZ2`) — DEACTIVATED (retired 2026-04-20)
- Speed-to-Lead flywheel, After Hours flywheel, Video Content Generator — all healthy

## Slack
- **#ai-command-center**: `C0ALD81NG1E`

## Known Bash Gotcha
- The `\!` character gets escaped to `\\!` in bash heredocs even with single-quoted delimiters when run through the MCP bash tool
- Workaround: use Python with `chr(33)` to construct strings containing `\!`, then base64 encode
