import { Router } from "express";
import {
  clearActivity,
  deleteActivity,
  listActivity,
  subscribeActivity,
  subscribeActivityCleared,
} from "../services/activity";

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
 *   delete:
 *     summary: Clear all activity events
 *     tags: [Activity]
 *     responses:
 *       200:
 *         description: Cleared count
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

activityRouter.delete("/", (_req, res) => {
  const removed = clearActivity();
  res.json({ cleared: removed });
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

  const unsubscribeClear = subscribeActivityCleared(() => {
    res.write(`event: activity_cleared\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    unsubscribeClear();
  });
});

/**
 * @openapi
 * /api/activity/{id}:
 *   delete:
 *     summary: Delete one activity event
 *     tags: [Activity]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Not found
 */
activityRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid activity id" });
    return;
  }
  const ok = deleteActivity(id);
  if (!ok) {
    res.status(404).json({ error: "Activity not found" });
    return;
  }
  res.json({ deleted: id });
});
