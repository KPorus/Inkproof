import { store } from "../store/memory";
import type { ActivityEvent } from "../types";

export async function recordActivity(
  stage: string,
  message: string,
  orderId: string | null = null,
  meta: Record<string, unknown> = {}
): Promise<ActivityEvent> {
  return store.recordActivity(stage, message, orderId, meta);
}

export async function listActivity(limit = 50, afterId?: number): Promise<ActivityEvent[]> {
  return store.listActivity(limit, afterId);
}

export function subscribeActivity(listener: (event: ActivityEvent) => void): () => void {
  return store.subscribeActivity(listener);
}

export function subscribeActivityCleared(listener: () => void): () => void {
  return store.subscribeActivityCleared(listener);
}

export function deleteActivity(id: number): boolean {
  return store.deleteActivity(id);
}

export function clearActivity(): number {
  return store.clearActivity();
}
