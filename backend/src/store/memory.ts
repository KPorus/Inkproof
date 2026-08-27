import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ActivityEvent, Job, Order, OrderStatus, Product } from "../types";
import { log } from "../utils/logger";

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

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

type ActivityListener = (event: ActivityEvent) => void;
type ClearListener = () => void;

type PersistedShape = {
  activitySeq: number;
  simulatePdfFailure: boolean;
  orders: Order[];
  jobs: Job[];
  activity: ActivityEvent[];
};

function reviveDates<T extends { created_at: Date | string; updated_at?: Date | string }>(
  row: T
): T {
  return {
    ...row,
    created_at: new Date(row.created_at),
    ...(row.updated_at !== undefined ? { updated_at: new Date(row.updated_at) } : {}),
  };
}

class MemoryStore {
  products: Product[] = SEED_PRODUCTS.map((p) => ({
    ...p,
    created_at: new Date(),
  }));
  orders = new Map<string, Order>();
  jobs = new Map<string, Job>();
  activity: ActivityEvent[] = [];
  simulatePdfFailure = false;
  private activitySeq = 0;
  private activityListeners = new Set<ActivityListener>();
  private clearListeners = new Set<ClearListener>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  loadFromDisk(): void {
    try {
      if (!fs.existsSync(STORE_FILE)) {
        log("store", "No persisted store file — starting empty");
        return;
      }
      const raw = JSON.parse(fs.readFileSync(STORE_FILE, "utf8")) as PersistedShape;
      this.activitySeq = raw.activitySeq ?? 0;
      this.simulatePdfFailure = Boolean(raw.simulatePdfFailure);
      this.orders = new Map(
        (raw.orders ?? []).map((o) => {
          const order = reviveDates(o);
          return [order.id, order];
        })
      );
      this.jobs = new Map(
        (raw.jobs ?? []).map((j) => {
          const job = reviveDates(j);
          return [job.id, job];
        })
      );
      this.activity = (raw.activity ?? []).map((e) => ({
        ...e,
        created_at: new Date(e.created_at),
      }));
      log("store", "Loaded persisted state", {
        orders: this.orders.size,
        activity: this.activity.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      log("store", "Failed to load store.json — starting empty", { error: message });
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persistNow(), 150);
  }

  persistNow(): void {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const payload: PersistedShape = {
        activitySeq: this.activitySeq,
        simulatePdfFailure: this.simulatePdfFailure,
        orders: [...this.orders.values()],
        jobs: [...this.jobs.values()],
        activity: this.activity,
      };
      fs.writeFileSync(STORE_FILE, JSON.stringify(payload, null, 2), "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      log("store", "Failed to persist store.json", { error: message });
    }
  }

  setSimulatePdfFailure(value: boolean): void {
    this.simulatePdfFailure = value;
    this.schedulePersist();
  }

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
    status?: OrderStatus;
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
    this.schedulePersist();
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
    this.schedulePersist();
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
    this.schedulePersist();
    return job;
  }

  updateJob(id: string, patch: Partial<Job>): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    const next = { ...job, ...patch, updated_at: new Date() };
    this.jobs.set(id, next);
    this.schedulePersist();
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
    this.schedulePersist();
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

  listActivityForOrder(orderId: string): ActivityEvent[] {
    return this.activity.filter((e) => e.order_id === orderId);
  }

  deleteActivity(id: number): boolean {
    const before = this.activity.length;
    this.activity = this.activity.filter((e) => e.id !== id);
    const changed = this.activity.length < before;
    if (changed) this.schedulePersist();
    return changed;
  }

  clearActivity(): number {
    const count = this.activity.length;
    this.activity = [];
    this.schedulePersist();
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
