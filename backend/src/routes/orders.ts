import fs from "fs";
import path from "path";
import { Router } from "express";
import { pool } from "../db/pool";
import type { Order } from "../types";

export const ordersRouter = Router();

type OrderRow = Order & {
  product_name: string;
  product_slug: string;
};

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
ordersRouter.get("/", async (_req, res, next) => {
  try {
    const result = await pool.query<OrderRow>(
      `SELECT o.*, p.name AS product_name, p.slug AS product_slug
       FROM orders o
       JOIN products p ON p.id = o.product_id
       ORDER BY o.created_at DESC
       LIMIT 50`
    );
    res.json({ orders: result.rows });
  } catch (error) {
    next(error);
  }
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
ordersRouter.get("/:id", async (req, res, next) => {
  try {
    const result = await pool.query<OrderRow>(
      `SELECT o.*, p.name AS product_name, p.slug AS product_slug
       FROM orders o
       JOIN products p ON p.id = o.product_id
       WHERE o.id = $1`,
      [req.params.id]
    );
    const order = result.rows[0];
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json({ order });
  } catch (error) {
    next(error);
  }
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
ordersRouter.get("/:id/receipt", async (req, res, next) => {
  try {
    const result = await pool.query<{ receipt_path: string | null; status: string }>(
      `SELECT receipt_path, status FROM orders WHERE id = $1`,
      [req.params.id]
    );
    const order = result.rows[0];
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
  } catch (error) {
    next(error);
  }
});
