import { Router } from "express";
import Stripe from "stripe";
import { config } from "../config";
import { pool } from "../db/pool";
import { recordActivity } from "../services/activity";
import type { Product } from "../types";

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

    const productResult = await pool.query<Product>(
      `SELECT id, slug, name, description, amount_cents, currency
       FROM products WHERE id = $1`,
      [productId]
    );
    const product = productResult.rows[0];
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const orderResult = await pool.query<{ id: string }>(
      `INSERT INTO orders (product_id, customer_email, amount_cents, currency, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id`,
      [product.id, customerEmail ?? null, product.amount_cents, product.currency]
    );
    const orderId = orderResult.rows[0].id;

    await recordActivity(
      "checkout_created",
      `Checkout started for ${product.name}`,
      orderId,
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
        orderId,
        productId: product.id,
        productName: product.name,
      },
    });

    await pool.query(
      `UPDATE orders SET stripe_session_id = $2, updated_at = NOW() WHERE id = $1`,
      [orderId, session.id]
    );

    await recordActivity(
      "stripe_session_created",
      "Stripe Checkout Session created",
      orderId,
      { sessionId: session.id }
    );

    res.json({
      orderId,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    next(error);
  }
});
