export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  amount_cents: number;
  currency: string;
  created_at: Date;
};

export type OrderStatus = "pending" | "paid" | "pdf_ready" | "failed";

export type Order = {
  id: string;
  product_id: string;
  stripe_session_id: string | null;
  customer_email: string | null;
  amount_cents: number;
  currency: string;
  status: OrderStatus;
  receipt_path: string | null;
  created_at: Date;
  updated_at: Date;
};

export type JobStatus = "queued" | "running" | "completed" | "failed";

export type Job = {
  id: string;
  order_id: string;
  type: string;
  status: JobStatus;
  error: string | null;
  created_at: Date;
  updated_at: Date;
};

export type ActivityEvent = {
  id: number;
  order_id: string | null;
  stage: string;
  message: string;
  meta: Record<string, unknown>;
  created_at: Date;
};

export type PurchasePaidPayload = {
  orderId: string;
  productName: string;
  customerEmail: string | null;
  amountCents: number;
  currency: string;
  stripeSessionId: string;
};
