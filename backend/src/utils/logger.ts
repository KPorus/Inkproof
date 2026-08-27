type LogScope = "webhook" | "event-bus" | "pdf-worker" | "demo" | "store";

export type ServerLogLine = {
  id: number;
  scope: LogScope;
  message: string;
  details?: Record<string, unknown>;
  created_at: string;
};

type LogListener = (line: ServerLogLine) => void;

let seq = 0;
const recent: ServerLogLine[] = [];
const listeners = new Set<LogListener>();
const MAX_RECENT = 200;

function stamp(): string {
  return new Date().toISOString();
}

export function log(scope: LogScope, message: string, details?: Record<string, unknown>): void {
  const created_at = stamp();
  const prefix = `[Inkproof:${scope}] ${created_at}`;
  if (details && Object.keys(details).length > 0) {
    console.log(prefix, message, details);
  } else {
    console.log(prefix, message);
  }

  const line: ServerLogLine = {
    id: ++seq,
    scope,
    message,
    details,
    created_at,
  };
  recent.push(line);
  if (recent.length > MAX_RECENT) {
    recent.splice(0, recent.length - MAX_RECENT);
  }
  for (const listener of listeners) {
    listener(line);
  }
}

export function listRecentLogs(limit = 100): ServerLogLine[] {
  return recent.slice(-limit);
}

export function subscribeLogs(listener: LogListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
