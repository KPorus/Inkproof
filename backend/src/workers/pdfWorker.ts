import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { bus } from "../events/bus";
import { recordActivity } from "../services/activity";
import { store } from "../store/memory";
import type { PurchasePaidPayload } from "../types";
import { log } from "../utils/logger";

const RECEIPTS_DIR = path.join(process.cwd(), "uploads", "receipts");

function ensureReceiptsDir(): void {
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

async function generateReceiptPdf(payload: PurchasePaidPayload, jobId: string): Promise<string> {
  ensureReceiptsDir();
  const filename = `receipt-${payload.orderId}.pdf`;
  const filePath = path.join(RECEIPTS_DIR, filename);

  log("pdf-worker", "Writing PDF with PDFKit", { orderId: payload.orderId, filePath });

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc
      .fillColor("#0B3D3A")
      .fontSize(28)
      .text("Inkproof", { align: "left" });

    doc
      .moveDown(0.3)
      .fillColor("#1F2933")
      .fontSize(12)
      .text("Proof of purchase", { align: "left" });

    doc.moveDown(1.2);
    doc
      .strokeColor("#0F766E")
      .lineWidth(1.5)
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke();

    doc.moveDown(1.2);
    doc.fillColor("#111827").fontSize(11);
    doc.text(`Order ID: ${payload.orderId}`);
    doc.text(`Job ID: ${jobId}`);
    doc.text(`Stripe session: ${payload.stripeSessionId}`);
    doc.text(`Date: ${new Date().toUTCString()}`);
    doc.moveDown();
    doc.text(`Product: ${payload.productName}`);
    doc.text(`Customer: ${payload.customerEmail ?? "guest@inkproof.dev"}`);
    doc.text(`Amount: ${formatMoney(payload.amountCents, payload.currency)}`);

    doc.moveDown(2);
    doc
      .fillColor("#0F766E")
      .fontSize(10)
      .text(
        "Generated asynchronously by the Inkproof PDF worker after the purchase.paid event.",
        { width: 480 }
      );

    doc.end();
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });

  return filePath;
}

export async function handlePurchasePaid(payload: PurchasePaidPayload): Promise<void> {
  log("pdf-worker", "Background handler started for purchase.paid", {
    orderId: payload.orderId,
    productName: payload.productName,
    amountCents: payload.amountCents,
    simulateFailure: store.simulatePdfFailure,
  });

  const job = store.createJob(payload.orderId);
  log("pdf-worker", "Job queued", { orderId: payload.orderId, jobId: job.id });

  await recordActivity(
    "event_received",
    "purchase.paid received by PDF worker",
    payload.orderId,
    { jobId: job.id, event: "purchase.paid" }
  );

  store.updateJob(job.id, { status: "running" });
  bus.emit("pdf.started", { orderId: payload.orderId, jobId: job.id });
  await recordActivity(
    "pdf_started",
    "PDF generation started in background",
    payload.orderId,
    { jobId: job.id }
  );

  try {
    if (store.simulatePdfFailure) {
      throw new Error("Simulated PDF failure (demo toggle is ON)");
    }

    const receiptPath = await generateReceiptPdf(payload, job.id);
    const relativePath = path.relative(process.cwd(), receiptPath);

    store.updateOrder(payload.orderId, {
      status: "pdf_ready",
      receipt_path: relativePath,
    });
    store.updateJob(job.id, { status: "completed" });

    bus.emit("pdf.completed", {
      orderId: payload.orderId,
      jobId: job.id,
      receiptPath: relativePath,
    });
    await recordActivity(
      "pdf_completed",
      "Proof-of-purchase PDF ready for download",
      payload.orderId,
      { jobId: job.id, receiptPath: relativePath }
    );
    log("pdf-worker", "PDF completed", {
      orderId: payload.orderId,
      jobId: job.id,
      receiptPath: relativePath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown PDF error";
    log("pdf-worker", "PDF failed", { orderId: payload.orderId, jobId: job.id, error: message });
    store.updateJob(job.id, { status: "failed", error: message });
    store.updateOrder(payload.orderId, { status: "failed" });
    bus.emit("pdf.failed", { orderId: payload.orderId, jobId: job.id, error: message });
    await recordActivity("pdf_failed", `PDF generation failed: ${message}`, payload.orderId, {
      jobId: job.id,
    });
  }
}

export function registerPdfWorker(): void {
  ensureReceiptsDir();
  log("pdf-worker", "Registering listener for purchase.paid");
  bus.on("purchase.paid", (payload) => {
    log("pdf-worker", "EventEmitter delivered purchase.paid", { orderId: payload.orderId });
    void handlePurchasePaid(payload);
  });
}

export function buildRetryPayload(orderId: string): PurchasePaidPayload | null {
  const order = store.getOrder(orderId);
  if (!order) return null;
  const product = store.getProduct(order.product_id);
  return {
    orderId: order.id,
    productName: product?.name ?? "Inkproof product",
    customerEmail: order.customer_email,
    amountCents: order.amount_cents,
    currency: order.currency,
    stripeSessionId: order.stripe_session_id ?? `retry-${order.id}`,
  };
}
