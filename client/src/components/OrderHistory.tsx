import type { Order } from "../api";
import { receiptUrl } from "../api";

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

type Props = {
  orders: Order[];
  selectedId: string | null;
  onSelect: (order: Order) => void;
  onRetry: (orderId: string) => void;
  busy?: boolean;
};

export function OrderHistory({ orders, selectedId, onSelect, onRetry, busy }: Props) {
  if (orders.length === 0) {
    return <p className="muted">No orders yet.</p>;
  }

  const selected = orders.find((o) => o.id === selectedId) ?? null;

  return (
    <div className="orders-wrap">
      <ul className="order-list">
        {orders.map((order) => (
          <li key={order.id}>
            <button
              type="button"
              className={`order-row ${selectedId === order.id ? "is-selected" : ""}`}
              onClick={() => onSelect(order)}
            >
              <div>
                <strong>{order.product_name ?? "Product"}</strong>
                <span className="mono small">{order.id.slice(0, 8)}…</span>
              </div>
              <div className="order-row-right">
                <span className={`status status-${order.status}`}>{order.status}</span>
                <span>{formatMoney(order.amount_cents, order.currency)}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {selected ? (
        <div className="receipt-preview">
          <div className="preview-actions">
            {(selected.status === "failed" || selected.status === "paid") && (
              <button
                type="button"
                className="btn ghost small"
                disabled={busy}
                onClick={() => onRetry(selected.id)}
              >
                Retry PDF
              </button>
            )}
            {selected.status === "pdf_ready" ? (
              <a
                className="btn primary small"
                href={receiptUrl(selected.id)}
                target="_blank"
                rel="noreferrer"
              >
                Download
              </a>
            ) : null}
          </div>
          {selected.status === "pdf_ready" ? (
            <iframe
              title={`Receipt ${selected.id}`}
              className="pdf-frame"
              src={receiptUrl(selected.id, true)}
            />
          ) : (
            <p className="muted">PDF preview appears when status is pdf_ready.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
