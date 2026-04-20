import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Shared secret Instantly sends in query string: ?secret=LEADS_WEBHOOK_SECRET
// Set LEADS_WEBHOOK_SECRET and N8N_REPLY_WEBHOOK_URL in FluidOS Railway env vars.
const WEBHOOK_SECRET   = process.env.LEADS_WEBHOOK_SECRET;
const N8N_WEBHOOK_URL  = process.env.N8N_REPLY_WEBHOOK_URL;

export async function POST(req: NextRequest) {
  // Validate secret
  if (WEBHOOK_SECRET) {
    const provided = req.nextUrl.searchParams.get('secret')
                  ?? req.headers.get('x-webhook-secret');
    if (provided !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 1. Write to DB immediately — lead is safe regardless of what n8n does
  let queueId = -1;
  try {
    const db = getPool();
    const result = await db.query(
      `INSERT INTO leads_queue (payload, status) VALUES ($1, 'pending') RETURNING id`,
      [JSON.stringify(payload)]
    );
    queueId = result.rows[0].id;
    console.log(`[LEADS] Queued lead id=${queueId}`);
  } catch (dbErr) {
    // DB write failed — still try to forward to n8n, but log the miss
    console.error('[LEADS] DB write failed:', dbErr);
  }

  // 2. Try to forward to n8n immediately (best-effort, 5s timeout)
  if (N8N_WEBHOOK_URL) {
    try {
      const fwd = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (fwd.ok && queueId > 0) {
        // n8n got it — mark done so the poller skips it
        const db = getPool();
        await db.query(
          `UPDATE leads_queue SET status = 'done', processed_at = NOW() WHERE id = $1`,
          [queueId]
        );
        console.log(`[LEADS] Forwarded to n8n and marked done id=${queueId}`);
      }
    } catch {
      // n8n is down — lead stays 'pending', poller will drain it on recovery
      console.log(`[LEADS] n8n unreachable, lead id=${queueId} held in queue`);
    }
  }

  // Always 200 to Instantly — we have the lead
  return NextResponse.json({ ok: true, id: queueId }, { status: 200 });
}
