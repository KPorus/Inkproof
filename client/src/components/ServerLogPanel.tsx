import type { ServerLogLine } from "../api";

type Props = {
  logs: ServerLogLine[];
};

export function ServerLogPanel({ logs }: Props) {
  const ordered = [...logs].reverse();

  return (
    <div className="log-panel" aria-label="Server log">
      <div className="section-head compact">
        <h3>Server log</h3>
        <p>Same lines the API prints — streamed over SSE.</p>
      </div>
      {ordered.length === 0 ? (
        <p className="muted">Waiting for server logs…</p>
      ) : (
        <pre className="log-pre">
          {ordered.map((line) => {
            const detail =
              line.details && Object.keys(line.details).length > 0
                ? ` ${JSON.stringify(line.details)}`
                : "";
            return (
              <div key={line.id} className="log-line">
                <span className="log-scope">[{line.scope}]</span>{" "}
                <span className="log-time">{new Date(line.created_at).toLocaleTimeString()}</span>{" "}
                {line.message}
                {detail}
              </div>
            );
          })}
        </pre>
      )}
    </div>
  );
}
