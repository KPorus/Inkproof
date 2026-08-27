import { Router } from "express";
import Stripe from "stripe";
import { config } from "../config";
import { recordActivity } from "../services/activity";
import { store } from "../store/memory";

export const checkoutRouter = Router();

function getStripe(): Stripe {
  if (!config.stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(config.stripeSecretKey);
}

/**
 * @openapi
 * /api/checkout:
 *   post:
 *     summary: Create a Stripe Checkout Session for a product
 *     tags: [Checkout]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId]
 *             properties:
 *               productId:
 *                 type: string
 *                 format: uuid
 *               customerEmail:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Checkout URL and order id
 */
checkoutRouter.post("/", async (req, res, next) => {
  try {
    const { productId, customerEmail } = req.body as {
      productId?: string;
      customerEmail?: string;
    };

    if (!productId) {
      res.status(400).json({ error: "productId is required" });
      return;
    }

    const product = store.getProduct(productId);
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const order = store.createOrder({
      productId: product.id,
      customerEmail: customerEmail ?? null,
      amountCents: product.amount_cents,
      currency: product.currency,
    });

    await recordActivity(
      "checkout_created",
      `Checkout started for ${product.name}`,
      order.id,
      { productId: product.id, amountCents: product.amount_cents }
    );

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: customerEmail || undefined,
      success_url: config.successUrl,
      cancel_url: config.cancelUrl,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: product.currency,
            unit_amount: product.amount_cents,
            product_data: {
              name: product.name,
              description: product.description,
            },
          },
        },
      ],
      metadata: {
        orderId: order.id,
        productId: product.id,
        productName: product.name,
      },
    });

    store.updateOrder(order.id, { stripe_session_id: session.id });

    await recordActivity(
      "stripe_session_created",
      "Stripe Checkout Session created",
      order.id,
      { sessionId: session.id }
    );

    res.json({
      orderId: order.id,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    next(error);
  }
});
