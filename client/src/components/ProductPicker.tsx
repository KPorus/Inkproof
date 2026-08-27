import { useState } from "react";
import type { Product } from "../api";

type Props = {
  products: Product[];
  loading: boolean;
  onBuy: (product: Product, email: string) => void;
};

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export function ProductPicker({ products, loading, onBuy }: Props) {
  const [email, setEmail] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="picker">
      <label className="field">
        <span>Customer email (optional)</span>
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <ul className="product-list">
        {products.map((product) => {
          const selected = selectedId === product.id;
          return (
            <li key={product.id}>
              <button
                type="button"
                className={`product ${selected ? "is-selected" : ""}`}
                onClick={() => setSelectedId(product.id)}
              >
                <div>
                  <strong>{product.name}</strong>
                  <p>{product.description}</p>
                </div>
                <span className="price">{formatMoney(product.amount_cents, product.currency)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="btn primary"
        disabled={loading || !selectedId}
        onClick={() => {
          const product = products.find((p) => p.id === selectedId);
          if (product) onBuy(product, email);
        }}
      >
        {loading ? "Redirecting to Stripe…" : "Pay with Stripe"}
      </button>
    </div>
  );
}
