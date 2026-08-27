import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://inkproof:inkproof@localhost:5432/inkproof",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  successUrl:
    process.env.STRIPE_SUCCESS_URL ??
    "http://localhost:5173/?checkout=success&session_id={CHECKOUT_SESSION_ID}",
  cancelUrl:
    process.env.STRIPE_CANCEL_URL ?? "http://localhost:5173/?checkout=cancel",
};

export function assertStripeConfigured(): void {
  required("STRIPE_SECRET_KEY");
  required("STRIPE_WEBHOOK_SECRET");
}
