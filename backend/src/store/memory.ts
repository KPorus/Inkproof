import { randomUUID } from "crypto";
import type { ActivityEvent, Job, Order, Product } from "../types";

const SEED_PRODUCTS: Omit<Product, "created_at">[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "course-pack",
    name: "Course Pack",
    description: "Self-paced backend fundamentals with labs and notes.",
    amount_cents: 1900,
    currency: "usd",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "api-starter",
    name: "API Starter",
    description: "Boilerplate patterns for Express APIs and webhooks.",
    amount_cents: 2900,
    currency: "usd",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    slug: "design-kit",
    name: "Design Kit",
    description: "Visual system tokens for educational product demos.",
    amount_cents: 1500,
    currency: "usd",
  },
];

type ActivityListener = (event: ActivityEvent) => void;
type ClearListener = () => void;

class MemoryStore {
  products: Product[] = SEED_PRODUCTS.map((p) => ({
    ...p,
    created_at: new Date(),
  }));
  orders = new Map<string, Order>();
  jobs = new Map<string, Job>();
  activity: ActivityEvent[] = [];
  private activitySeq = 0;
  private activityListeners = new Set<ActivityListener>();
  private clearListeners = new Set<ClearListener>();

  listProducts(): Product[] {
    return [...this.products].sort((a, b) => a.amount_cents - b.amount_cents);
  }

  getProduct(id: string): Product | undefined {
    return this.products.find((p) => p.id === id);
  }

  createOrder(input: {
    id?: string;
    productId: string;
    customerEmail: string | null;
    amountCents: number;
    currency: string;
    status?: Order["status"];
    stripeSessionId?: string | null;
  }): Order {
    const now = new Date();
    const order: Order = {
      id: input.id ?? randomUUID(),
      product_id: input.productId,
      stripe_session_id: input.stripeSessionId ?? null,
      customer_email: input.customerEmail,
      amount_cents: input.amountCents,
      currency: input.currency,
      status: input.status ?? "pending",
      receipt_path: null,
      created_at: now,
      updated_at: now,
    };
    this.orders.set(order.id, order);
    return order;
  }

  getOrder(id: string): Order | undefined {
    return this.orders.get(id);
  }

  updateOrder(id: string, patch: Partial<Order>): Order | undefined {
    const order = this.orders.get(id);
    if (!order) return undefined;
    const next = { ...order, ...patch, updated_at: new Date() };
    this.orders.set(id, next);
    return next;
  }

  listOrders(limit = 50): Array<Order & { product_name: string; product_slug: string }> {
    return [...this.orders.values()]
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .slice(0, limit)
      .map((order) => {
        const product = this.getProduct(order.product_id);
        return {
          ...order,
          product_name: product?.name ?? "Unknown",
          product_slug: product?.slug ?? "unknown",
        };
      });
  }

  createJob(orderId: string): Job {
    const now = new Date();
    const job: Job = {
      id: randomUUID(),
      order_id: orderId,
      type: "generate_pdf",
      status: "queued",
      error: null,
      created_at: now,
      updated_at: now,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  updateJob(id: string, patch: Partial<Job>): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    const next = { ...job, ...patch, updated_at: new Date() };
    this.jobs.set(id, next);
    return next;
  }

  recordActivity(
    stage: string,
    message: string,
    orderId: string | null = null,
    meta: Record<string, unknown> = {}
  ): ActivityEvent {
    const event: ActivityEvent = {
      id: ++this.activitySeq,
      order_id: orderId,
      stage,
      message,
      meta,
      created_at: new Date(),
    };
    this.activity.push(event);
    for (const listener of this.activityListeners) {
      listener(event);
    }
    return event;
  }

  listActivity(limit = 50, afterId?: number): ActivityEvent[] {
    if (afterId) {
      return this.activity.filter((e) => e.id > afterId).slice(0, limit);
    }
    return this.activity.slice(-limit);
  }

  deleteActivity(id: number): boolean {
    const before = this.activity.length;
    this.activity = this.activity.filter((e) => e.id !== id);
    return this.activity.length < before;
  }

  clearActivity(): number {
    const count = this.activity.length;
    this.activity = [];
    for (const listener of this.clearListeners) {
      listener();
    }
    return count;
  }

  subscribeActivity(listener: ActivityListener): () => void {
    this.activityListeners.add(listener);
    return () => this.activityListeners.delete(listener);
  }

  subscribeActivityCleared(listener: ClearListener): () => void {
    this.clearListeners.add(listener);
    return () => this.clearListeners.delete(listener);
  }
}

export const store = new MemoryStore();
