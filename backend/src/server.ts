import { app } from "./app.js";
import { config } from "./config.js";
import os from "node:os";
import { dataConstructionQueue } from "./services/market/construction/data-construction-queue.service.js";
import { cacheCleanupService } from "./services/shared/cache-cleanup.service.js";
import { logger } from "./services/shared/logger.service.js";
import { marketScheduler } from "./schedulers/market-scheduler.service.js";
import { objectiveScheduler } from "./schedulers/objective-scheduler.service.js";

function localNetworkUrls(port: number) {
  return Object.values(os.networkInterfaces())
    .flatMap((items) => items ?? [])
    .filter((item) => item.family === "IPv4" && !item.internal)
    .map((item) => `http://${item.address}:${port}`);
}

const server = app.listen(config.port, "0.0.0.0", () => {
  logger.info("api", "PEA Portfolio API listening", {
    url: `http://127.0.0.1:${config.port}`,
    bind: "0.0.0.0",
    localNetworkUrls: localNetworkUrls(config.port)
  });
  cacheCleanupService.start();
  dataConstructionQueue.start();
  marketScheduler.start();
  objectiveScheduler.start();
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    logger.error("api", "Port already in use", { port: config.port });
    process.exit(1);
  }

  logger.error("api", "Server error", { error });
  process.exit(1);
});
