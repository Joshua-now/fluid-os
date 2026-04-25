import { Pool } from 'pg';

// Singleton pool — reused across Next.js requests on the same Railway instance.
// DATABASE_URL must be set in FluidOS Railway service env vars.
// In Railway, reference it from the n8n service: ${{n8n-production-5955.DATABASE_URL}}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set in FluidOS environment');
    pool = new Pool({
      connectionString: url,
      // Railway internal connections don't need SSL; external do
      ssl: url.includes('localhost') || url.includes('.railway.internal')
        ? false
        : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message);
    });
  }
  return pool;
}

// One-time table setup — call POST /api/leads/setup to run this
export async function ensureLeadsQueue(): Promise<void> {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS leads_queue (
      id           SERIAL PRIMARY KEY,
      received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ,
      status       TEXT        NOT NULL DEFAULT 'pending',
      attempts     INT         NOT NULL DEFAULT 0,
      payload      JSONB       NOT NULL,
      error        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_leads_queue_status
      ON leads_queue (status);
    CREATE INDEX IF NOT EXISTS idx_leads_queue_received
      ON leads_queue (received_at);
  `);
}
