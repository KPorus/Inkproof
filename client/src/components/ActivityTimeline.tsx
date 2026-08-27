import type { ActivityEvent } from "../api";

const CAPTIONS: Record<string, string> = {
  checkout_created: "Order saved in memory as pending before redirecting to Stripe.",
  stripe_session_created: "Checkout Session URL returned to the browser.",
  webhook_received: "Raw body signature verified; payment confirmed.",
  event_emitted: "In-process EventEmitter notified listeners.",
  event_received: "PDF worker subscribed handler picked up the event.",
  pdf_started: "Background worker opened a PDFKit document stream.",
  pdf_completed: "Receipt written to disk; order status → pdf_ready.",
  pdf_failed: "Worker caught an error and marked the job failed.",
};

type Props = {
  events: ActivityEvent[];
  onRemove: (id: number) => void;
  onClearAll: () => void;
  busy?: boolean;
};

export function ActivityTimeline({ events, onRemove, onClearAll, busy }: Props) {
  if (events.length === 0) {
    return <p className="muted">No activity yet — buy a product to see backend steps appear.</p>;
  }

  const ordered = [...events].reverse();

  return (
    <div className="timeline-wrap">
      <div className="timeline-actions">
        <button type="button" className="btn ghost small" disabled={busy} onClick={onClearAll}>
          Clear all activity
        </button>
      </div>
      <ol className="timeline">
        {ordered.map((event) => (
          <li key={event.id} className="timeline-item">
            <div className="timeline-dot" />
            <div className="timeline-body">
              <div className="timeline-meta">
                <span className="stage">{event.stage}</span>
                <div className="timeline-meta-right">
                  <time dateTime={event.created_at}>
                    {new Date(event.created_at).toLocaleTimeString()}
                  </time>
                  <button
                    type="button"
                    className="link-btn"
                    disabled={busy}
                    onClick={() => onRemove(event.id)}
                    aria-label={`Remove activity ${event.stage}`}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <p className="timeline-message">{event.message}</p>
              <p className="timeline-caption">
                {CAPTIONS[event.stage] ?? "Backend activity event."}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
