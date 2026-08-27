import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const clientUrl = (process.env.CLIENT_URL ?? "http://localhost:5173").replace(/\/$/, "");

export const config = {
  port: Number(process.env.PORT ?? 5000),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  clientUrl,
  // Stripe requires URLs; these pages only auto-close the checkout tab.
  successUrl:
    process.env.STRIPE_SUCCESS_URL ??
    `${clientUrl}/checkout-close.html?status=success`,
  cancelUrl:
    process.env.STRIPE_CANCEL_URL ??
    `${clientUrl}/checkout-close.html?status=cancel`,
};

export function assertStripeConfigured(): void {
  required("STRIPE_SECRET_KEY");
  required("STRIPE_WEBHOOK_SECRET");
}
