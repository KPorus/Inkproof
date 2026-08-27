import { Router } from "express";
import { store } from "../store/memory";
import { log } from "../utils/logger";

export const demoRouter = Router();

/**
 * @openapi
 * /api/demo/settings:
 *   get:
 *     summary: Demo teaching toggles
 *     tags: [Demo]
 *     responses:
 *       200:
 *         description: Current settings
 *   patch:
 *     summary: Update demo teaching toggles
 *     tags: [Demo]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               simulatePdfFailure:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Updated settings
 */
demoRouter.get("/settings", (_req, res) => {
  res.json({
    simulatePdfFailure: store.simulatePdfFailure,
  });
});

demoRouter.patch("/settings", (req, res) => {
  const { simulatePdfFailure } = req.body as { simulatePdfFailure?: boolean };
  if (typeof simulatePdfFailure === "boolean") {
    store.setSimulatePdfFailure(simulatePdfFailure);
    log("demo", "simulatePdfFailure updated", { simulatePdfFailure });
  }
  res.json({
    simulatePdfFailure: store.simulatePdfFailure,
  });
});
