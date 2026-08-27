import { Router, raw } from "express";
import Stripe from "stripe";
import { config } from "../config";
import { pool } from "../db/pool";
import { bus } from "../events/bus";
import { recordActivity } from "../services/activity";

export const webhookRouter = Router();

function getStripe(): Stripe {
  if (!config.stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(config.stripeSecretKey);
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
  const signature = req.headers["stripe-signature"];
  if (!signature || Array.isArray(signature)) {
    res.status(400).send("Missing stripe-signature header");
    return;
  }

  if (!config.stripeWebhookSecret) {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature";
    res.status(400).send(`Webhook Error: ${message}`);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    const productName = session.metadata?.productName ?? "Inkproof product";

    if (orderId) {
      const orderResult = await pool.query<{
        id: string;
        amount_cents: number;
        currency: string;
        status: string;
      }>(
        `SELECT id, amount_cents, currency, status FROM orders WHERE id = $1`,
        [orderId]
      );
      const order = orderResult.rows[0];

      if (order && order.status === "pending") {
        await pool.query(
          `UPDATE orders
           SET status = 'paid',
               customer_email = COALESCE($2, customer_email),
               stripe_session_id = COALESCE(stripe_session_id, $3),
               updated_at = NOW()
           WHERE id = $1`,
          [orderId, session.customer_details?.email ?? session.customer_email, session.id]
        );

        await recordActivity(
          "webhook_received",
          "Stripe checkout.session.completed verified",
          orderId,
          { eventId: event.id, sessionId: session.id }
        );

        bus.emit("purchase.paid", {
          orderId,
          productName,
          customerEmail: session.customer_details?.email ?? session.customer_email,
          amountCents: order.amount_cents,
          currency: order.currency,
          stripeSessionId: session.id,
        });

        await recordActivity(
          "event_emitted",
          "Emitted purchase.paid on the in-process event bus",
          orderId,
          { event: "purchase.paid" }
        );
      }
    }
  }

  res.json({ received: true });
});
