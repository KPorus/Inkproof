type LogScope = "webhook" | "event-bus" | "pdf-worker";

function stamp(): string {
  return new Date().toISOString();
}

export function log(scope: LogScope, message: string, details?: Record<string, unknown>): void {
  const prefix = `[Inkproof:${scope}] ${stamp()}`;
  if (details && Object.keys(details).length > 0) {
    console.log(prefix, message, details);
  } else {
    console.log(prefix, message);
  }
}
