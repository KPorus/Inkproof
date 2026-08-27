import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearActivity,
  createCheckout,
  deleteActivity,
  fetchActivity,
  fetchDemoSettings,
  fetchOrder,
  fetchOrders,
  fetchProducts,
  getApiUrl,
  openActivityStream,
  receiptUrl,
  retryPdf,
  updateDemoSettings,
  type ActivityEvent,
  type Order,
  type Product,
  type ServerLogLine,
} from "./api";
import { ArchitectureDiagram } from "./components/ArchitectureDiagram";
import { ActivityTimeline } from "./components/ActivityTimeline";
import { DemoControls } from "./components/DemoControls";
import { OrderHistory } from "./components/OrderHistory";
import { ProductPicker } from "./components/ProductPicker";
import { ServerLogPanel } from "./components/ServerLogPanel";

const STAGE_TO_NODE: Record<string, string> = {
  checkout_created: "client",
  stripe_session_created: "stripe",
  webhook_received: "webhook",
  event_emitted: "bus",
  event_received: "bus",
  pdf_started: "pdf",
  pdf_completed: "memory",
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
  const [logs, setLogs] = useState<ServerLogLine[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [loadingBuy, setLoadingBuy] = useState(false);
  const [activityBusy, setActivityBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [simulatePdfFailure, setSimulatePdfFailure] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const replayTimers = useRef<number[]>([]);

  function refreshOrders() {
    void fetchOrders()
      .then((data) => setOrders(data.orders))
      .catch(() => undefined);
  }

  useEffect(() => {
    void fetchProducts()
      .then((data) => setProducts(data.products))
      .catch((err: Error) => setError(err.message));

    void fetchActivity()
      .then((data) => setEvents(data.events))
      .catch(() => undefined);

    void fetchDemoSettings()
      .then((data) => setSimulatePdfFailure(data.simulatePdfFailure))
      .catch(() => undefined);

    refreshOrders();

    const stored = localStorage.getItem("inkproof_order_id");
    if (stored) setActiveOrderId(stored);

    const close = openActivityStream(
      (event) => {
        setEvents((prev) => {
          if (prev.some((e) => e.id === event.id)) return prev;
          return [...prev, event].slice(-120);
        });
        refreshOrders();
      },
      () => setEvents([]),
      (line) => {
        setLogs((prev) => {
          if (prev.some((l) => l.id === line.id)) return prev;
          return [...prev, line].slice(-150);
        });
      }
    );
    return () => {
      close();
      replayTimers.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    if (!activeOrderId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const data = await fetchOrder(activeOrderId);
        if (!cancelled) {
          setOrder(data.order);
          refreshOrders();
        }
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
    if (highlightId) {
      const highlighted = events.find((e) => e.id === highlightId);
      if (highlighted && STAGE_TO_NODE[highlighted.stage]) {
        return STAGE_TO_NODE[highlighted.stage];
      }
    }
    const latest = [...events].reverse().find((e) => STAGE_TO_NODE[e.stage]);
    return latest ? STAGE_TO_NODE[latest.stage] : null;
  }, [events, highlightId]);

  const errorNode = useMemo(() => {
    const failed = [...events].reverse().find((e) => e.stage === "pdf_failed");
    return failed ? "pdf" : null;
  }, [events]);

  async function handleBuy(product: Product, email: string) {
    setError(null);
    setCheckoutUrl(null);
    setLoadingBuy(true);
    try {
      const result = await createCheckout(product.id, email || undefined);
      localStorage.setItem("inkproof_order_id", result.orderId);
      setActiveOrderId(result.orderId);
      refreshOrders();
      if (!result.url) {
        throw new Error("Stripe did not return a checkout URL");
      }

      const checkoutTab = window.open(result.url, "_blank");
      if (!checkoutTab) {
        setCheckoutUrl(result.url);
        setBanner("Popup blocked. Click “Open Stripe Checkout” below, and keep this tab open.");
      } else {
        setBanner(
          "Stripe Checkout opened in a new tab. Keep this page open to watch webhook → event → PDF."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setLoadingBuy(false);
    }
  }

  async function handleRemoveActivity(id: number) {
    setActivityBusy(true);
    setError(null);
    try {
      await deleteActivity(id);
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove activity");
    } finally {
      setActivityBusy(false);
    }
  }

  async function handleClearActivity() {
    setActivityBusy(true);
    setError(null);
    try {
      await clearActivity();
      setEvents([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear activity");
    } finally {
      setActivityBusy(false);
    }
  }

  function handleReplay() {
    replayTimers.current.forEach((id) => window.clearTimeout(id));
    replayTimers.current = [];

    const orderId = activeOrderId;
    const sequence = orderId
      ? events.filter((e) => e.order_id === orderId)
      : events.slice(-12);

    if (sequence.length === 0) {
      setBanner("Nothing to replay yet — complete a purchase first.");
      return;
    }

    setBanner(`Replaying ${sequence.length} stages for learning (no new Stripe charge).`);
    sequence.forEach((event, index) => {
      const timer = window.setTimeout(() => {
        setHighlightId(event.id);
        document.getElementById(`activity-${event.id}`)?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
        if (index === sequence.length - 1) {
          window.setTimeout(() => setHighlightId(null), 1200);
        }
      }, index * 900);
      replayTimers.current.push(timer);
    });
  }

  async function handleToggleFailure(value: boolean) {
    setDemoBusy(true);
    try {
      const data = await updateDemoSettings(value);
      setSimulatePdfFailure(data.simulatePdfFailure);
      setBanner(
        value
          ? "Simulate PDF failure is ON — the next PDF job will fail on purpose."
          : "Simulate PDF failure is OFF — PDF jobs run normally."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update demo settings");
    } finally {
      setDemoBusy(false);
    }
  }

  async function handleRetry(orderId: string) {
    setDemoBusy(true);
    setError(null);
    try {
      await retryPdf(orderId);
      setActiveOrderId(orderId);
      localStorage.setItem("inkproof_order_id", orderId);
      setBanner("Retry emitted purchase.paid — watch the timeline and server log.");
      refreshOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setDemoBusy(false);
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
      {checkoutUrl ? (
        <div className="banner">
          <a className="btn primary" href={checkoutUrl} target="_blank" rel="noreferrer">
            Open Stripe Checkout
          </a>
        </div>
      ) : null}

      <section className="section" id="architecture" aria-labelledby="arch-title">
        <div className="section-head">
          <h2 id="arch-title">Live architecture</h2>
          <p>Nodes light up as backend activity stages arrive over SSE.</p>
        </div>
        <ArchitectureDiagram activeNode={activeNode} errorNode={errorNode} />
        <DemoControls
          simulatePdfFailure={simulatePdfFailure}
          onToggle={handleToggleFailure}
          busy={demoBusy}
        />
      </section>

      <section className="section" id="buy" aria-labelledby="buy-title">
        <div className="section-head">
          <h2 id="buy-title">Buy a demo product</h2>
          <p>Creates a real Stripe Checkout Session (test mode) and a pending order.</p>
        </div>
        <ProductPicker products={products} loading={loadingBuy} onBuy={handleBuy} />
      </section>

      <section className="split">
        <div className="section" aria-labelledby="timeline-title">
          <div className="section-head">
            <h2 id="timeline-title">Activity timeline</h2>
            <p>Lesson tips explain why each step exists. Replay highlights stages in order.</p>
          </div>
          <ActivityTimeline
            events={events}
            highlightId={highlightId}
            busy={activityBusy}
            onRemove={handleRemoveActivity}
            onClearAll={handleClearActivity}
            onReplay={handleReplay}
          />
        </div>

        <div className="section" aria-labelledby="logs-title">
          <h2 id="logs-title" className="sr-only">
            Server logs
          </h2>
          <ServerLogPanel logs={logs} />
        </div>
      </section>

      <section className="split">
        <div className="section" aria-labelledby="orders-title">
          <div className="section-head">
            <h2 id="orders-title">Order history</h2>
            <p>Revisit receipts and retry failed PDF jobs.</p>
          </div>
          <OrderHistory
            orders={orders}
            selectedId={activeOrderId}
            busy={demoBusy}
            onSelect={(o) => {
              setActiveOrderId(o.id);
              localStorage.setItem("inkproof_order_id", o.id);
              setOrder(o);
            }}
            onRetry={handleRetry}
          />
        </div>

        <div className="section receipt-panel" aria-labelledby="receipt-title">
          <div className="section-head">
            <h2 id="receipt-title">Active receipt</h2>
            <p>When the PDF worker finishes, preview and download proof of purchase.</p>
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
              {order.status === "failed" ? (
                <button
                  type="button"
                  className="btn primary"
                  disabled={demoBusy}
                  onClick={() => handleRetry(order.id)}
                >
                  Retry PDF
                </button>
              ) : null}
              {order.status === "pdf_ready" ? (
                <>
                  <a
                    className="btn primary"
                    href={receiptUrl(order.id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download PDF
                  </a>
                  <iframe
                    title="Active receipt preview"
                    className="pdf-frame"
                    src={receiptUrl(order.id, true)}
                  />
                </>
              ) : order.status !== "failed" ? (
                <p className="muted">Waiting for webhook + background PDF job…</p>
              ) : (
                <p className="muted">PDF failed — turn off simulate failure, then retry.</p>
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
