import { NextRequest, NextResponse } from 'next/server';
import { ensureLeadsQueue } from '@/lib/db';

export const dynamic = 'force-dynamic';

// One-time setup: creates the leads_queue table in Postgres.
// Call once after deploying: POST /api/leads/setup
// with header: x-api-key: <LEADS_WEBHOOK_SECRET>
export async function POST(req: NextRequest) {
  const key = process.env.LEADS_WEBHOOK_SECRET;
  if (key && req.headers.get('x-api-key') !== key) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureLeadsQueue();
    return NextResponse.json({ ok: true, message: 'leads_queue table is ready' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[SETUP] leads_queue setup failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
