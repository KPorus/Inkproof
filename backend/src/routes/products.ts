import { Router } from "express";
import { pool } from "../db/pool";
import type { Product } from "../types";

export const productsRouter = Router();

/**
 * @openapi
 * /api/products:
 *   get:
 *     summary: List demo products
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Product catalog
 */
productsRouter.get("/", async (_req, res, next) => {
  try {
    const result = await pool.query<Product>(
      `SELECT id, slug, name, description, amount_cents, currency, created_at
       FROM products
       ORDER BY amount_cents ASC`
    );
    res.json({ products: result.rows });
  } catch (error) {
    next(error);
  }
});
