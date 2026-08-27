import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { config } from "./config";
import { activityRouter } from "./routes/activity";
import { checkoutRouter } from "./routes/checkout";
import { ordersRouter } from "./routes/orders";
import { productsRouter } from "./routes/products";
import { webhookRouter } from "./routes/webhook";
import { mountSwagger } from "./swagger";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: config.clientUrl,
      credentials: true,
    })
  );

  // Stripe needs the raw body — mount webhook before JSON parser
  app.use("/api/webhook", webhookRouter);

  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "inkproof-backend",
      time: new Date().toISOString(),
    });
  });

  app.use("/api/products", productsRouter);
  app.use("/api/checkout", checkoutRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/activity", activityRouter);

  mountSwagger(app);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  });

  return app;
}
