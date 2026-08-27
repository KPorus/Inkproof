import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import type { Express } from "express";
import { config } from "./config";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Inkproof API",
      version: "1.0.0",
      description:
        "Educational API: Stripe Checkout → webhook → EventEmitter → PDF proof of purchase.",
    },
    servers: [{ url: `http://localhost:${config.port}` }],
  },
  apis: ["./src/routes/*.ts", "./dist/routes/*.js"],
};

export function mountSwagger(app: Express): void {
  const spec = swaggerJsdoc(options);
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec, { explorer: true }));
  app.get("/api/docs.json", (_req, res) => {
    res.json(spec);
  });
}
