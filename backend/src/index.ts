import { createApp } from "./app";
import { config } from "./config";
import { registerPdfWorker } from "./workers/pdfWorker";

function main() {
  registerPdfWorker();

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`Inkproof API listening on http://localhost:${config.port}`);
    console.log(`Swagger docs at http://localhost:${config.port}/api/docs`);
    console.log("Storage: in-memory (no database)");
  });
}

try {
  main();
} catch (error) {
  console.error("Failed to start Inkproof backend", error);
  process.exit(1);
}
