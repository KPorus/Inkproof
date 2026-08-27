const NODES = [
  {
    id: "client",
    label: "React Client",
    note: "POST /api/checkout",
  },
  {
    id: "api",
    label: "Express API",
    note: "Creates Checkout Session",
  },
  {
    id: "stripe",
    label: "Stripe",
    note: "Collects payment",
  },
  {
    id: "webhook",
    label: "Webhook",
    note: "Verifies signature",
  },
  {
    id: "bus",
    label: "Event Bus",
    note: "emit purchase.paid",
  },
  {
    id: "pdf",
    label: "PDF Worker",
    note: "PDFKit receipt",
  },
  {
    id: "memory",
    label: "File Store",
    note: "orders + jobs + activity",
  },
] as const;

type Props = {
  activeNode: string | null;
  errorNode?: string | null;
};

export function ArchitectureDiagram({ activeNode, errorNode }: Props) {
  return (
    <div className="arch" role="img" aria-label="Inkproof request and event flow diagram">
      <ol className="arch-flow">
        {NODES.map((node, index) => {
          const lit =
            activeNode === node.id ||
            (node.id === "api" && activeNode === "stripe");
          const errored = errorNode === node.id;
          return (
            <li
              key={node.id}
              className={`arch-node ${lit ? "is-active" : ""} ${errored ? "is-error" : ""}`}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <span className="arch-index">{index + 1}</span>
              <div>
                <strong>{node.label}</strong>
                <span className="arch-note">{node.note}</span>
              </div>
              {index < NODES.length - 1 ? (
                <span className="arch-arrow" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
      <aside className="arch-legend">
        <p>
          <strong>Annotation:</strong> the webhook returns <code>200</code> immediately after
          emitting <code>purchase.paid</code>. Heavy PDF work runs on the EventEmitter listener.
          State is file-backed so Render restarts keep demo history.
        </p>
      </aside>
    </div>
  );
}
