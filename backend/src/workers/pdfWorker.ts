import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { pool } from "../db/pool";
import { bus } from "../events/bus";
import { recordActivity } from "../services/activity";
import type { PurchasePaidPayload } from "../types";

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

async function handlePurchasePaid(payload: PurchasePaidPayload): Promise<void> {
  const jobResult = await pool.query<{ id: string }>(
    `INSERT INTO jobs (order_id, type, status)
     VALUES ($1, 'generate_pdf', 'queued')
     RETURNING id`,
    [payload.orderId]
  );
  const jobId = jobResult.rows[0].id;

  await recordActivity(
    "event_received",
    "purchase.paid received by PDF worker",
    payload.orderId,
    { jobId, event: "purchase.paid" }
  );

  await pool.query(
    `UPDATE jobs SET status = 'running', updated_at = NOW() WHERE id = $1`,
    [jobId]
  );
  bus.emit("pdf.started", { orderId: payload.orderId, jobId });
  await recordActivity(
    "pdf_started",
    "PDF generation started in background",
    payload.orderId,
    { jobId }
  );

  try {
    const receiptPath = await generateReceiptPdf(payload, jobId);
    const relativePath = path.relative(process.cwd(), receiptPath);

    await pool.query(
      `UPDATE orders
       SET status = 'pdf_ready', receipt_path = $2, updated_at = NOW()
       WHERE id = $1`,
      [payload.orderId, relativePath]
    );
    await pool.query(
      `UPDATE jobs SET status = 'completed', updated_at = NOW() WHERE id = $1`,
      [jobId]
    );

    bus.emit("pdf.completed", {
      orderId: payload.orderId,
      jobId,
      receiptPath: relativePath,
    });
    await recordActivity(
      "pdf_completed",
      "Proof-of-purchase PDF ready for download",
      payload.orderId,
      { jobId, receiptPath: relativePath }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown PDF error";
    await pool.query(
      `UPDATE jobs SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [jobId, message]
    );
    await pool.query(
      `UPDATE orders SET status = 'failed', updated_at = NOW() WHERE id = $1`,
      [payload.orderId]
    );
    bus.emit("pdf.failed", { orderId: payload.orderId, jobId, error: message });
    await recordActivity("pdf_failed", `PDF generation failed: ${message}`, payload.orderId, {
      jobId,
    });
  }
}

export function registerPdfWorker(): void {
  ensureReceiptsDir();
  bus.on("purchase.paid", (payload) => {
    void handlePurchasePaid(payload);
  });
}
