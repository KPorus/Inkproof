import { Router } from "express";
import { store } from "../store/memory";

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
productsRouter.get("/", (_req, res) => {
  res.json({ products: store.listProducts() });
});
