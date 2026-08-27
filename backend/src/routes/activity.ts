import { Router } from "express";
import { listActivity, subscribeActivity } from "../services/activity";

export const activityRouter = Router();

/**
 * @openapi
 * /api/activity:
 *   get:
 *     summary: List recent backend activity events
 *     tags: [Activity]
 *     parameters:
 *       - in: query
 *         name: afterId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Activity feed
 */
activityRouter.get("/", async (req, res, next) => {
  try {
    const afterId = req.query.afterId ? Number(req.query.afterId) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const events = await listActivity(
      Number.isFinite(limit) ? Math.min(limit, 100) : 50,
      Number.isFinite(afterId) ? afterId : undefined
    );
    res.json({ events });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/activity/stream:
 *   get:
 *     summary: Server-Sent Events stream of activity
 *     tags: [Activity]
 *     responses:
 *       200:
 *         description: text/event-stream
 */
activityRouter.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  const unsubscribe = subscribeActivity((event) => {
    res.write(`event: activity\ndata: ${JSON.stringify(event)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
