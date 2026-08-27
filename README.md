# Inkproof

Educational demo: **Stripe Checkout → webhook → EventEmitter → PDF proof-of-purchase**, with a React client that visualizes the live backend architecture.


## How to use Inkproof, and what it’s for

**Inkproof** is a demo shop: you buy a product with Stripe, then get a PDF receipt. The page also shows, live, what the backend is doing.

### For anyone (non-tech)

**What you do**

1. Open the site and pick a product (Course Pack, API Starter, or Design Kit). Optionally enter an email.
2. Click **Pay with Stripe**. A Stripe checkout tab opens (test mode — no real money).
3. Complete payment. Keep the Inkproof tab open.
4. Watch the diagram and timeline update. When the receipt is ready, preview or download the PDF.
5. Later, open **Order history** to see past purchases and retry a receipt if it failed.

**What you get**

| Feature | Use |
| --- | --- |
| Buy with Stripe | Pay for a demo product the way a real store would |
| PDF receipt | Proof of purchase you can view and download |
| Order history | Find old orders and receipts again |
| Live diagram + timeline | See each step of the purchase without reading code |
| Replay / clear activity | Replay the last purchase for learning, or clean the timeline |
| Simulate PDF failure + Retry | Practice “receipt failed → try again” |

**Why it exists:** it shows the full path from “I paid” to “I have a receipt,” including waiting and retries — not just a checkout button.


## How PDF generation works

PDF work is **not** done in the Stripe webhook. Payment is confirmed first; the receipt is built afterward by a dedicated worker using **PDFKit**.

**Trigger.** Webhook (or Retry) emits `purchase.paid` with order id, product name, email, amount, currency, Stripe session id.

**Job.** Worker creates a `generate_pdf` job (`queued` → `running`) and records `event_received` / `pdf_started`.

**Build.** `generateReceiptPdf`:

- Ensures `uploads/receipts/`
- Writes `receipt-{orderId}.pdf` (A4, streamed to disk)
- Draws: “Inkproof”, “Proof of purchase”, order/job/session ids, date, product, customer, amount
- Footer: generated asynchronously after `purchase.paid`

**Success.** Order → `pdf_ready` with `receipt_path`; job → `completed`; activity `pdf_completed`. UI can then GET the receipt (`inline=1` for preview, otherwise download).

**Failure.** Demo toggle can throw on purpose. Job/order → `failed`; activity `pdf_failed`. Retry resets the order to `paid`, clears the path, and emits `purchase.paid` again.

**Why this shape:** PDF drawing is slow compared with “tell Stripe we got the event.” Generating inside the webhook would delay the 200 and risk Stripe retries.

```23:79:backend/src/workers/pdfWorker.ts
async function generateReceiptPdf(payload: PurchasePaidPayload, jobId: string): Promise<string> {
  ensureReceiptsDir();
  const filename = `receipt-${payload.orderId}.pdf`;
  const filePath = path.join(RECEIPTS_DIR, filename);
  // PDFKit document → write stream → A4 receipt fields → doc.end()
  return filePath;
}
```

## How background work works

“Background” here means **work after the HTTP request has already answered**, not a separate Redis queue or worker process.

**Startup.** On boot the API loads `store.json` and registers the PDF worker on the in-process bus:

```7:9:backend/src/index.ts
function main() {
  store.loadFromDisk();
  registerPdfWorker();
```

**Bus.** Node `EventEmitter` wrapped as a typed bus (`purchase.paid`, `pdf.started`, `pdf.completed`, `pdf.failed`). `emit` returns immediately; listeners run without blocking the webhook’s 200.

**Worker.** `registerPdfWorker` does `bus.on("purchase.paid", …)` and calls `handlePurchasePaid` with `void` (fire-and-forget). Same path as checkout: create job, optional simulated failure, write PDF, update store, record activity.

**Why the webhook stays thin**

1. Verify Stripe signature  
2. Mark order paid (skip if already processed)  
3. `bus.emit("purchase.paid", payload)`  
4. `res.json({ received: true })` — PDF is already running off the request

**Retry** is the same background path: `POST /api/orders/:id/retry-pdf` rebuilds the payload and emits `purchase.paid` again. No extra Stripe charge.

**What the UI sees.** Activity and logs go out over SSE; the client also polls the order every 2s so status/PDF appear when the job finishes.

**Limits (by design).** Same Node process, no Redis/Bull. A process crash can drop an in-flight job (retry covers that for the demo). Not a production job system — it shows **webhook fast, heavy work async**.

**Related ops (not the PDF job):** GitHub Actions pings `/api/health` every 10 minutes so the Render free-tier API stays awake. That is keep-alive, not receipt generation.


## Stack

| Layer | Tech |
| --- | --- |
| Backend | Node.js, Express, TypeScript, CORS, Stripe, PDFKit, Swagger |
| Storage | File-backed memory (`backend/data/store.json`) |
| Background jobs | In-process EventEmitter (`purchase.paid` → PDF worker) |
| Client | React + Vite + TypeScript |
| Deploy | Client → GitHub Pages; API → Render (or similar) |

## Repo layout

```
backend/     Express API
client/      Educational React UI
.github/workflows/
```

## Quick start

### 1. Backend

```bash
cd backend
cp .env.example .env
# Fill STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET
pnpm install
pnpm dev
```

API: `http://localhost:5000`  
Swagger: `http://localhost:5000/api/docs`

No Postgres required. Orders, jobs, and activity persist to `backend/data/store.json` so Render restarts keep demo history.

### 2. Stripe webhook (local)

```bash
stripe listen --forward-to localhost:5000/api/webhook
```

Copy the printed `whsec_…` into `backend/.env` as `STRIPE_WEBHOOK_SECRET`.

### 3. Client

```bash
cd client
cp .env.example .env
pnpm install
pnpm dev
```

Set `VITE_API_URL` in `client/.env` (default `http://localhost:5000`).

Open `http://localhost:5173`, pick a product, complete Stripe **test** checkout, and watch the architecture + activity timeline update as the PDF is forged. Use **Remove** / **Clear all activity** on the timeline.

## Flow

1. Client calls `POST /api/checkout` → Stripe Checkout Session  
2. Stripe sends `checkout.session.completed` to `/api/webhook`  
3. Webhook verifies signature, saves the order in memory, emits `purchase.paid`  
4. PDF worker generates a receipt under `backend/uploads/receipts/`  
5. Client polls / streams activity and offers PDF download  

## Render deploy

- **Root Directory:** `backend`  
- **Build:** `pnpm install && pnpm build`  
- **Start:** `pnpm start`  
- Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CLIENT_URL` (Pages URL), success/cancel URLs  
- **No `DATABASE_URL`**

## GitHub Pages

Push to `main` runs `.github/workflows/deploy-client.yml`.  
Set repo **Settings → Pages → Source** to **GitHub Actions**.  
The client build sets `VITE_API_URL=https://inkproof.onrender.com`.

## Render keep-awake (cron)

[`.github/workflows/keep-render-awake.yml`](.github/workflows/keep-render-awake.yml) probes `https://inkproof.onrender.com/api/health` every 10 minutes and only does a long wake request if the service looks asleep.

## License

MIT — for learning and demos.
