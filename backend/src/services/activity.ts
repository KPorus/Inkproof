import { pool } from "../db/pool";
import type { ActivityEvent } from "../types";

type ActivityListener = (event: ActivityEvent) => void;

const listeners = new Set<ActivityListener>();

export async function recordActivity(
  stage: string,
  message: string,
  orderId: string | null = null,
  meta: Record<string, unknown> = {}
): Promise<ActivityEvent> {
  const result = await pool.query<ActivityEvent>(
    `INSERT INTO activity_events (order_id, stage, message, meta)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id, order_id, stage, message, meta, created_at`,
    [orderId, stage, message, JSON.stringify(meta)]
  );
  const event = result.rows[0];
  for (const listener of listeners) {
    listener(event);
  }
  return event;
}

export async function listActivity(limit = 50, afterId?: number): Promise<ActivityEvent[]> {
  if (afterId) {
    const result = await pool.query<ActivityEvent>(
      `SELECT id, order_id, stage, message, meta, created_at
       FROM activity_events
       WHERE id > $1
       ORDER BY id ASC
       LIMIT $2`,
      [afterId, limit]
    );
    return result.rows;
  }

  const result = await pool.query<ActivityEvent>(
    `SELECT id, order_id, stage, message, meta, created_at
     FROM activity_events
     ORDER BY id DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows.reverse();
}

export function subscribeActivity(listener: ActivityListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
