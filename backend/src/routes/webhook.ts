import { Router, raw } from "express";
import Stripe from "stripe";
import { config } from "../config";
import { bus } from "../events/bus";
import { recordActivity } from "../services/activity";
import { store } from "../store/memory";
import type { Order } from "../types";
import { log } from "../utils/logger";

export const webhookRouter = Router();

function getStripe(): Stripe {
  if (!config.stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(config.stripeSecretKey);
}

function resolveOrderFromSession(session: Stripe.Checkout.Session): Order | null {
  const orderId = session.metadata?.orderId;
  if (!orderId) return null;

  const existing = store.getOrder(orderId);
  if (existing) return existing;

  // Memory can be wiped on Render sleep/restart — rebuild from Stripe metadata.
  const productId =
    session.metadata?.productId ?? store.listProducts()[0]?.id ?? "unknown-product";
  const amountCents = session.amount_total ?? 0;
  const currency = session.currency ?? "usd";

  log("webhook", "Order missing in memory — recreating from Stripe session", {
    orderId,
    productId,
    amountCents,
  });

  return store.createOrder({
    id: orderId,
    productId,
    customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
    amountCents,
    currency,
    status: "pending",
    stripeSessionId: session.id,
  });
}

/**
 * @openapi
 * /api/webhook:
 *   post:
 *     summary: Stripe webhook (raw body required)
 *     tags: [Webhook]
 *     responses:
 *       200:
 *         description: Event received
 */
webhookRouter.post("/", raw({ type: "application/json" }), async (req, res) => {
  log("webhook", "Incoming Stripe webhook request");

  const signature = req.headers["stripe-signature"];
  if (!signature || Array.isArray(signature)) {
    log("webhook", "Rejected: missing stripe-signature header");
    res.status(400).send("Missing stripe-signature header");
    return;
  }

  if (!config.stripeWebhookSecret) {
    log("webhook", "Rejected: STRIPE_WEBHOOK_SECRET is not configured");
    res.status(500).send("STRIPE_WEBHOOK_SECRET is not configured");
    return;
  }

  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      signature,
      config.stripeWebhookSecret
    );
    log("webhook", "Signature verified", { type: event.type, eventId: event.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature";
    log("webhook", "Signature verification failed", { error: message });
    res.status(400).send(`Webhook Error: ${message}`);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    const productName = session.metadata?.productName ?? "Inkproof product";

    log("webhook", "Handling checkout.session.completed", {
      orderId,
      sessionId: session.id,
      productName,
    });

    if (orderId) {
      const order = resolveOrderFromSession(session);

      if (!order) {
        log("webhook", "Skipping: could not resolve order", { orderId });
      } else if (order.status !== "pending") {
        log("webhook", "Skipping emit: order already processed", {
          orderId,
          status: order.status,
        });
      } else {
        store.updateOrder(orderId, {
          status: "paid",
          customer_email:
            session.customer_details?.email ?? session.customer_email ?? order.customer_email,
          stripe_session_id: session.id,
        });

        log("webhook", "Order marked paid in memory store", { orderId, status: "paid" });

        await recordActivity(
          "webhook_received",
          "Stripe checkout.session.completed verified",
          orderId,
          { eventId: event.id, sessionId: session.id }
        );

        const payload = {
          orderId,
          productName,
          customerEmail: session.customer_details?.email ?? session.customer_email,
          amountCents: order.amount_cents || session.amount_total || 0,
          currency: order.currency || session.currency || "usd",
          stripeSessionId: session.id,
        };

        log("webhook", "Emitting purchase.paid to EventEmitter bus", {
          orderId,
          event: "purchase.paid",
        });
        bus.emit("purchase.paid", payload);

        await recordActivity(
          "event_emitted",
          "Emitted purchase.paid on the in-process event bus",
          orderId,
          { event: "purchase.paid" }
        );

        log("webhook", "Responding 200 to Stripe (PDF runs in background)", { orderId });
      }
    } else {
      log("webhook", "Skipping: checkout session has no orderId metadata");
    }
  } else {
    log("webhook", "Ignoring unhandled Stripe event type", { type: event.type });
  }

  res.json({ received: true });
});
