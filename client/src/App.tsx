import { useEffect, useMemo, useState } from "react";
import {
  createCheckout,
  fetchActivity,
  fetchOrder,
  fetchProducts,
  getApiUrl,
  openActivityStream,
  receiptUrl,
  type ActivityEvent,
  type Order,
  type Product,
} from "./api";
import { ArchitectureDiagram } from "./components/ArchitectureDiagram";
import { ActivityTimeline } from "./components/ActivityTimeline";
import { ProductPicker } from "./components/ProductPicker";

const STAGE_TO_NODE: Record<string, string> = {
  checkout_created: "client",
  stripe_session_created: "stripe",
  webhook_received: "webhook",
  event_emitted: "bus",
  event_received: "bus",
  pdf_started: "pdf",
  pdf_completed: "db",
  pdf_failed: "pdf",
};

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [loadingBuy, setLoadingBuy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout === "success") {
      setBanner("Payment returned from Stripe. Watching webhook → event → PDF…");
    } else if (checkout === "cancel") {
      setBanner("Checkout canceled. Pick a product to try again.");
    }
  }, []);

  useEffect(() => {
    void fetchProducts()
      .then((data) => setProducts(data.products))
      .catch((err: Error) => setError(err.message));

    void fetchActivity()
      .then((data) => setEvents(data.events))
      .catch(() => undefined);

    const stored = localStorage.getItem("inkproof_order_id");
    if (stored) setActiveOrderId(stored);

    const close = openActivityStream((event) => {
      setEvents((prev) => {
        if (prev.some((e) => e.id === event.id)) return prev;
        return [...prev, event].slice(-80);
      });
    });
    return close;
  }, []);

  useEffect(() => {
    if (!activeOrderId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const data = await fetchOrder(activeOrderId);
        if (!cancelled) setOrder(data.order);
      } catch {
        // order may not exist yet
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [activeOrderId]);

  const activeNode = useMemo(() => {
    const latest = [...events].reverse().find((e) => STAGE_TO_NODE[e.stage]);
    return latest ? STAGE_TO_NODE[latest.stage] : null;
  }, [events]);

  async function handleBuy(product: Product, email: string) {
    setError(null);
    setLoadingBuy(true);
    try {
      const result = await createCheckout(product.id, email || undefined);
      localStorage.setItem("inkproof_order_id", result.orderId);
      setActiveOrderId(result.orderId);
      if (!result.url) {
        throw new Error("Stripe did not return a checkout URL");
      }
      window.location.href = result.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setLoadingBuy(false);
    }
  }

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden="true" />

      <header className="hero">
        <p className="eyebrow">Educational backend demo</p>
        <h1 className="brand">Inkproof</h1>
        <p className="lede">
          Watch Stripe Checkout fire a webhook, emit an in-process event, and forge a PDF
          proof of purchase — live.
        </p>
        <div className="hero-actions">
          <a className="btn primary" href="#buy">
            Start a purchase
          </a>
          <a className="btn ghost" href={`${getApiUrl()}/api/docs`} target="_blank" rel="noreferrer">
            Open Swagger
          </a>
        </div>
      </header>

      {banner ? <div className="banner">{banner}</div> : null}
      {error ? <div className="banner error">{error}</div> : null}

      <section className="section" id="architecture" aria-labelledby="arch-title">
        <div className="section-head">
          <h2 id="arch-title">Live architecture</h2>
          <p>Nodes light up as backend activity stages arrive over SSE.</p>
        </div>
        <ArchitectureDiagram activeNode={activeNode} />
      </section>

      <section className="section" id="buy" aria-labelledby="buy-title">
        <div className="section-head">
          <h2 id="buy-title">Buy a demo product</h2>
          <p>Creates a real Stripe Checkout Session (test mode) and a pending order row.</p>
        </div>
        <ProductPicker products={products} loading={loadingBuy} onBuy={handleBuy} />
      </section>

      <section className="split">
        <div className="section" aria-labelledby="timeline-title">
          <div className="section-head">
            <h2 id="timeline-title">Activity timeline</h2>
            <p>Each caption maps to a real server-side step.</p>
          </div>
          <ActivityTimeline events={events} />
        </div>

        <div className="section receipt-panel" aria-labelledby="receipt-title">
          <div className="section-head">
            <h2 id="receipt-title">Receipt</h2>
            <p>When the PDF worker finishes, download your proof of purchase.</p>
          </div>
          {order ? (
            <div className="receipt-card">
              <dl>
                <div>
                  <dt>Order</dt>
                  <dd className="mono">{order.id}</dd>
                </div>
                <div>
                  <dt>Product</dt>
                  <dd>{order.product_name ?? "—"}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className={`status status-${order.status}`}>{order.status}</span>
                  </dd>
                </div>
                <div>
                  <dt>Amount</dt>
                  <dd>{formatMoney(order.amount_cents, order.currency)}</dd>
                </div>
              </dl>
              {order.status === "pdf_ready" ? (
                <a className="btn primary" href={receiptUrl(order.id)} target="_blank" rel="noreferrer">
                  Download PDF
                </a>
              ) : (
                <p className="muted">Waiting for webhook + background PDF job…</p>
              )}
            </div>
          ) : (
            <p className="muted">No active order yet. Start a purchase to track one.</p>
          )}
        </div>
      </section>

      <footer className="footer">
        <span>Inkproof</span>
        <span className="muted">API {getApiUrl()}</span>
      </footer>
    </div>
  );
}
