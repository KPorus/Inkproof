import { Router } from "express";
import {
  clearActivity,
  deleteActivity,
  listActivity,
  subscribeActivity,
  subscribeActivityCleared,
} from "../services/activity";
import { store } from "../store/memory";
import { listRecentLogs, subscribeLogs } from "../utils/logger";

export const activityRouter = Router();

/**
 * @openapi
 * /api/activity:
 *   get:
 *     summary: List recent backend activity events
 *     tags: [Activity]
 *   delete:
 *     summary: Clear all activity events
 *     tags: [Activity]
 */
activityRouter.get("/", async (req, res, next) => {
  try {
    const afterId = req.query.afterId ? Number(req.query.afterId) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 80;
    const orderId = typeof req.query.orderId === "string" ? req.query.orderId : undefined;
    if (orderId) {
      res.json({ events: store.listActivityForOrder(orderId) });
      return;
    }
    const events = await listActivity(
      Number.isFinite(limit) ? Math.min(limit, 200) : 80,
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
 * /api/activity/logs:
 *   get:
 *     summary: Recent server log lines
 *     tags: [Activity]
 */
activityRouter.get("/logs", (_req, res) => {
  res.json({ logs: listRecentLogs(100) });
});

/**
 * @openapi
 * /api/activity/stream:
 *   get:
 *     summary: SSE stream of activity + server logs
 *     tags: [Activity]
 */
activityRouter.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  for (const line of listRecentLogs(40)) {
    res.write(`event: log\ndata: ${JSON.stringify(line)}\n\n`);
  }

  const unsubscribe = subscribeActivity((event) => {
    res.write(`event: activity\ndata: ${JSON.stringify(event)}\n\n`);
  });

  const unsubscribeClear = subscribeActivityCleared(() => {
    res.write(`event: activity_cleared\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  });

  const unsubscribeLogs = subscribeLogs((line) => {
    res.write(`event: log\ndata: ${JSON.stringify(line)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    unsubscribeClear();
    unsubscribeLogs();
  });
});

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
