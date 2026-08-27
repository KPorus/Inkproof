# Inkproof

Educational demo: **Stripe Checkout → webhook → EventEmitter → PDF proof-of-purchase**, with a React client that visualizes the live backend architecture.

## Stack

| Layer | Tech |
| --- | --- |
| Backend | Node.js, Express, TypeScript, CORS, Stripe, PDFKit, Swagger |
| Storage | In-memory (no database) |
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

No Postgres / Docker database required. Orders, jobs, and activity live in memory (reset on restart).

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
Set Actions variable `VITE_API_URL` to your live Render API URL.

## Render keep-awake (cron)

[`.github/workflows/keep-render-awake.yml`](.github/workflows/keep-render-awake.yml) probes `/api/health` every 10 minutes and only does a long wake request if the service looks asleep.

Set variable `RENDER_BACKEND_URL` to your Render URL.

## License

MIT — for learning and demos.
