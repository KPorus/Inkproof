# Inkproof

Educational demo: **Stripe Checkout → webhook → EventEmitter → PDF proof-of-purchase**, with a React client that visualizes the live backend architecture.

## Stack

| Layer | Tech |
| --- | --- |
| Backend | Node.js, Express, TypeScript, CORS, Stripe, PDFKit, Swagger |
| Database | PostgreSQL 16 (Docker) |
| Background jobs | In-process EventEmitter (`purchase.paid` → PDF worker) |
| Client | React + Vite + TypeScript |
| Deploy | GitHub Actions → GitHub Pages (`client/` only) |

## Repo layout

```
backend/     Express API
client/      Educational React UI
docker-compose.yml
.github/workflows/deploy-client.yml
```

## Quick start

### 1. Postgres

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Fill STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET
pnpm install
pnpm dev
```

API: `http://localhost:5000`  
Swagger: `http://localhost:5000/api/docs`

### 3. Stripe webhook (local)

```bash
stripe listen --forward-to localhost:5000/api/webhook
```

Copy the printed `whsec_…` into `backend/.env` as `STRIPE_WEBHOOK_SECRET`.

### 4. Client

```bash
cd client
pnpm install
pnpm dev
```

The client calls `http://localhost:5000` directly (hardcoded in `client/src/api.ts`).

Open `http://localhost:5173`, pick a product, complete Stripe **test** checkout, and watch the architecture + activity timeline update as the PDF is forged.

## Flow

1. Client calls `POST /api/checkout` → Stripe Checkout Session  
2. Stripe sends `checkout.session.completed` to `/api/webhook`  
3. Webhook verifies signature, saves the order, emits `purchase.paid`  
4. PDF worker generates a receipt under `backend/uploads/receipts/`  
5. Client polls / streams activity and offers PDF download  

## GitHub Pages

Push to `main` runs `.github/workflows/deploy-client.yml`.  
Set repo **Settings → Pages → Source** to **GitHub Actions**.

## Render keep-awake (cron)

Free Render web services sleep after ~15 minutes idle.  
[`.github/workflows/keep-render-awake.yml`](.github/workflows/keep-render-awake.yml) runs every **10 minutes**:

1. Short probe of `/api/health` (5s) — if **200**, already awake → stop  
2. If the probe fails → long request (up to 120s) to **wake** the service  

Set a repository variable:

**Settings → Secrets and variables → Actions → Variables**

| Name | Example |
| --- | --- |
| `RENDER_BACKEND_URL` | `https://your-service.onrender.com` |

You can also run it manually from the **Actions** tab → **Keep Render awake**.

## License

MIT — for learning and demos.
