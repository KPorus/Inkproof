export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  amount_cents: number;
  currency: string;
};

export type ActivityEvent = {
  id: number;
  order_id: string | null;
  stage: string;
  message: string;
  meta: Record<string, unknown>;
  created_at: string;
};

export type Order = {
  id: string;
  product_id: string;
  stripe_session_id: string | null;
  customer_email: string | null;
  amount_cents: number;
  currency: string;
  status: "pending" | "paid" | "pdf_ready" | "failed";
  receipt_path: string | null;
  product_name?: string;
  product_slug?: string;
  created_at: string;
  updated_at: string;
};

const API_URL = "http://localhost:5000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? response.statusText);
  }
  return response.json() as Promise<T>;
}

export function getApiUrl(): string {
  return API_URL;
}

export function fetchProducts() {
  return request<{ products: Product[] }>("/api/products");
}

export function createCheckout(productId: string, customerEmail?: string) {
  return request<{ orderId: string; sessionId: string; url: string | null }>("/api/checkout", {
    method: "POST",
    body: JSON.stringify({ productId, customerEmail }),
  });
}

export function fetchActivity(afterId?: number) {
  const query = afterId ? `?afterId=${afterId}` : "";
  return request<{ events: ActivityEvent[] }>(`/api/activity${query}`);
}

export function fetchOrder(id: string) {
  return request<{ order: Order }>(`/api/orders/${id}`);
}

export function receiptUrl(orderId: string): string {
  return `${API_URL}/api/orders/${orderId}/receipt`;
}

export function openActivityStream(onEvent: (event: ActivityEvent) => void): () => void {
  const source = new EventSource(`${API_URL}/api/activity/stream`);
  source.addEventListener("activity", (message) => {
    try {
      const data = JSON.parse((message as MessageEvent).data) as ActivityEvent;
      onEvent(data);
    } catch {
      // ignore malformed frames
    }
  });
  return () => source.close();
}
