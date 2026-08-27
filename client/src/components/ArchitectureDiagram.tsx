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
    id: "db",
    label: "PostgreSQL",
    note: "orders + jobs + activity",
  },
] as const;

type Props = {
  activeNode: string | null;
};

export function ArchitectureDiagram({ activeNode }: Props) {
  return (
    <div className="arch" role="img" aria-label="Inkproof request and event flow diagram">
      <ol className="arch-flow">
        {NODES.map((node, index) => {
          const lit =
            activeNode === node.id ||
            (node.id === "api" && activeNode === "stripe");
          return (
          <li
            key={node.id}
            className={`arch-node ${lit ? "is-active" : ""}`}
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <span className="arch-index">{index + 1}</span>
            <div>
              <strong>{node.label}</strong>
              <span className="arch-note">{node.note}</span>
            </div>
            {index < NODES.length - 1 ? <span className="arch-arrow" aria-hidden="true" /> : null}
          </li>
          );
        })}
      </ol>
      <aside className="arch-legend">
        <p>
          <strong>Annotation:</strong> the webhook returns <code>200</code> immediately after emitting{" "}
          <code>purchase.paid</code>. Heavy PDF work runs on the EventEmitter listener — not inside
          the Stripe request.
        </p>
      </aside>
    </div>
  );
}
