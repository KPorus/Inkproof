import { createApp } from "./app";
import { config } from "./config";
import { store } from "./store/memory";
import { registerPdfWorker } from "./workers/pdfWorker";
import { log } from "./utils/logger";

function main() {
  store.loadFromDisk();
  registerPdfWorker();

  const app = createApp();
  app.listen(config.port, () => {
    log("store", `Inkproof API listening on http://localhost:${config.port}`);
    console.log(`Swagger docs at http://localhost:${config.port}/api/docs`);
    console.log("Storage: file-backed memory (data/store.json)");
  });
}

try {
  main();
} catch (error) {
  console.error("Failed to start Inkproof backend", error);
  process.exit(1);
}
