import { pool } from "./pool";

const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  stripe_session_id TEXT UNIQUE,
  customer_email TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'pdf_ready', 'failed')),
  receipt_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'generate_pdf',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_events (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  stage TEXT NOT NULL,
  message TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_events_created_at
  ON activity_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
`;

const SEED_PRODUCTS = [
  {
    slug: "course-pack",
    name: "Course Pack",
    description: "Self-paced backend fundamentals with labs and notes.",
    amount_cents: 1900,
  },
  {
    slug: "api-starter",
    name: "API Starter",
    description: "Boilerplate patterns for Express APIs and webhooks.",
    amount_cents: 2900,
  },
  {
    slug: "design-kit",
    name: "Design Kit",
    description: "Visual system tokens for educational product demos.",
    amount_cents: 1500,
  },
];

export async function migrateAndSeed(): Promise<void> {
  await pool.query(SCHEMA_SQL);

  for (const product of SEED_PRODUCTS) {
    await pool.query(
      `INSERT INTO products (slug, name, description, amount_cents, currency)
       VALUES ($1, $2, $3, $4, 'usd')
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         amount_cents = EXCLUDED.amount_cents`,
      [product.slug, product.name, product.description, product.amount_cents]
    );
  }
}
