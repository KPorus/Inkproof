import type { ActivityEvent } from "../api";

export const LESSON_TIPS: Record<string, string> = {
  checkout_created:
    "Why: create a pending order before redirecting so the webhook can attach payment to a known id.",
  stripe_session_created:
    "Why: Stripe hosts PCI-compliant checkout; your API only creates a Session URL.",
  webhook_received:
    "Why: verify the signature on the raw body, then return 200 quickly so Stripe does not retry.",
  event_emitted:
    "Why: emit purchase.paid instead of generating the PDF inside the webhook request path.",
  event_received:
    "Why: a listener (worker) owns heavy work; the webhook stays thin and reliable.",
  pdf_started:
    "Why: background jobs keep payment confirmation fast even if PDF rendering is slow.",
  pdf_completed:
    "Why: persist a receipt path and flip status to pdf_ready so the UI can download proof.",
  pdf_failed:
    "Why: failures are first-class — mark the job failed so operators can retry safely.",
};

const CAPTIONS: Record<string, string> = {
  checkout_created: "Order saved before redirecting to Stripe.",
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
  highlightId: number | null;
  onRemove: (id: number) => void;
  onClearAll: () => void;
  onReplay: () => void;
  busy?: boolean;
};

export function ActivityTimeline({
  events,
  highlightId,
  onRemove,
  onClearAll,
  onReplay,
  busy,
}: Props) {
  if (events.length === 0) {
    return <p className="muted">No activity yet — buy a product to see backend steps appear.</p>;
  }

  const ordered = [...events].reverse();

  return (
    <div className="timeline-wrap">
      <div className="timeline-actions">
        <button type="button" className="btn ghost small" disabled={busy} onClick={onReplay}>
          Replay last purchase
        </button>
        <button type="button" className="btn ghost small" disabled={busy} onClick={onClearAll}>
          Clear all activity
        </button>
      </div>
      <ol className="timeline">
        {ordered.map((event) => (
          <li
            key={event.id}
            id={`activity-${event.id}`}
            className={`timeline-item ${highlightId === event.id ? "is-replay" : ""}`}
          >
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
              <p className="timeline-tip">
                {LESSON_TIPS[event.stage] ?? "Why: each stage maps to a real server-side decision."}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
