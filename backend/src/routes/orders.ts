import fs from "fs";
import path from "path";
import { Router } from "express";
import { bus } from "../events/bus";
import { recordActivity } from "../services/activity";
import { store } from "../store/memory";
import { buildRetryPayload } from "../workers/pdfWorker";
import { log } from "../utils/logger";

export const ordersRouter = Router();

/**
 * @openapi
 * /api/orders:
 *   get:
 *     summary: List recent orders
 *     tags: [Orders]
 *     responses:
 *       200:
 *         description: Orders with product names
 */
ordersRouter.get("/", (_req, res) => {
  res.json({ orders: store.listOrders() });
});

/**
 * @openapi
 * /api/orders/{id}:
 *   get:
 *     summary: Get order by id
 *     tags: [Orders]
 */
ordersRouter.get("/:id", (req, res) => {
  const order = store.getOrder(req.params.id);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const product = store.getProduct(order.product_id);
  res.json({
    order: {
      ...order,
      product_name: product?.name ?? "Unknown",
      product_slug: product?.slug ?? "unknown",
    },
  });
});

/**
 * @openapi
 * /api/orders/{id}/receipt:
 *   get:
 *     summary: Download or inline-view proof-of-purchase PDF
 *     tags: [Orders]
 */
ordersRouter.get("/:id/receipt", (req, res) => {
  const order = store.getOrder(req.params.id);
  if (!order?.receipt_path || order.status !== "pdf_ready") {
    res.status(404).json({ error: "Receipt not ready" });
    return;
  }

  const absolute = path.isAbsolute(order.receipt_path)
    ? order.receipt_path
    : path.join(process.cwd(), order.receipt_path);

  if (!fs.existsSync(absolute)) {
    res.status(404).json({ error: "Receipt file missing" });
    return;
  }

  const inline = req.query.inline === "1" || req.query.inline === "true";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${inline ? "inline" : "attachment"}; filename="inkproof-receipt-${req.params.id}.pdf"`
  );
  fs.createReadStream(absolute).pipe(res);
});

/**
 * @openapi
 * /api/orders/{id}/retry-pdf:
 *   post:
 *     summary: Re-emit purchase.paid to retry PDF generation
 *     tags: [Orders]
 */
ordersRouter.post("/:id/retry-pdf", async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const payload = buildRetryPayload(orderId);
    if (!payload) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    store.updateOrder(orderId, { status: "paid", receipt_path: null });
    await recordActivity(
      "event_emitted",
      "Retry: re-emitted purchase.paid for PDF job",
      orderId,
      { event: "purchase.paid", retry: true }
    );
    log("demo", "Retry PDF requested", { orderId });
    bus.emit("purchase.paid", payload);
    res.json({ ok: true, orderId });
  } catch (error) {
    next(error);
  }
});
