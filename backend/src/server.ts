import { app } from "./app.js";
import { config } from "./config.js";
import os from "node:os";
import { db } from "./db.js";
import { createGracefulShutdown } from "./graceful-shutdown.js";
import { authService } from "./services/auth/auth.service.js";
import { setupCodeLogDetails } from "./services/auth/setup-code.js";
import { dataConstructionQueue } from "./services/market/construction/data-construction-queue.service.js";
import { cacheCleanupService } from "./services/shared/cache-cleanup.service.js";
import { marketEventsService } from "./services/market/events/market-events.service.js";
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
  if (!authService.hasUsers()) {
    logger.info("auth", "first account setup code, required to create the administrator account", setupCodeLogDetails());
  }
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

/** Laisse aux tâches en cours (appel Yahoo borné à 15 s) le temps de finir ; voir `stop_grace_period`. */
const shutdownTimeoutMs = 18_000;

const shutdown = createGracefulShutdown({
  server,
  stopBackgroundWork: [
    { name: "market scheduler", run: () => marketScheduler.stop() },
    { name: "objective scheduler", run: () => objectiveScheduler.stop() },
    { name: "cache cleanup", run: () => { cacheCleanupService.stop(); } },
    { name: "market streams", run: () => { marketEventsService.closeAll(); } },
    { name: "data construction queue", run: () => dataConstructionQueue.stop() }
  ],
  releaseResources: [
    { name: "log files", run: () => logger.flush() },
    { name: "database", run: () => { db.close(); } }
  ],
  timeoutMs: shutdownTimeoutMs,
  exit: (code) => process.exit(code)
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => { void shutdown(signal); });
}
