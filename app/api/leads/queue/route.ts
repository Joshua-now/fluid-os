import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// n8n authenticates with the same LEADS_WEBHOOK_SECRET in x-api-key header
const API_KEY = process.env.LEADS_WEBHOOK_SECRET;

function isAuthed(req: NextRequest) {
  if (!API_KEY) return true; // no key configured = open (not recommended)
  return req.headers.get('x-api-key') === API_KEY;
}

// GET — n8n calls this every 3 minutes to drain the queue
// Returns leads that are 'pending' and older than 3 minutes
// (the 3-min gap ensures the immediate-forward in /incoming had time to mark them done)
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getPool();
    const result = await db.query(`
      SELECT id, received_at, payload, attempts
      FROM leads_queue
      WHERE status = 'pending'
        AND attempts < 5
        AND received_at < NOW() - INTERVAL '3 minutes'
      ORDER BY received_at ASC
      LIMIT 50
    `);
    return NextResponse.json({ leads: result.rows, count: result.rows.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — n8n calls this to acknowledge a lead (mark done or failed)
// Body: { id: number, status: 'done' | 'failed', error?: string }
export async function POST(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { id: number; status: string; error?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id, status, error } = body;
  if (!id || !['done', 'failed'].includes(status)) {
    return NextResponse.json({ error: 'id and status (done|failed) required' }, { status: 400 });
  }

  try {
    const db = getPool();
    await db.query(`
      UPDATE leads_queue
      SET
        status       = $1,
        processed_at = CASE WHEN $1 = 'done' THEN NOW() ELSE processed_at END,
        attempts     = attempts + 1,
        error        = $2
      WHERE id = $3
    `, [status, error ?? null, id]);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
