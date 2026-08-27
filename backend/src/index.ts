import { createApp } from "./app";
import { config } from "./config";
import { migrateAndSeed } from "./db/migrate";
import { registerPdfWorker } from "./workers/pdfWorker";

async function main() {
  await migrateAndSeed();
  registerPdfWorker();

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`Inkproof API listening on http://localhost:${config.port}`);
    console.log(`Swagger docs at http://localhost:${config.port}/api/docs`);
  });
}

main().catch((error) => {
  console.error("Failed to start Inkproof backend", error);
  process.exit(1);
});
