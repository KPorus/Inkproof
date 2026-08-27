import fs from "fs";
import path from "path";
import { Router } from "express";
import { store } from "../store/memory";

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
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Order detail
 *       404:
 *         description: Not found
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
 *     summary: Download proof-of-purchase PDF
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: PDF file
 *       404:
 *         description: Receipt not ready
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

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="inkproof-receipt-${req.params.id}.pdf"`
  );
  fs.createReadStream(absolute).pipe(res);
});
