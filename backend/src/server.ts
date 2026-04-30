import { app } from "./app.js";
import { config } from "./config.js";
import { logger } from "./services/shared/logger.service.js";
import { marketScheduler } from "./services/market/market.scheduler.js";

const server = app.listen(config.port, () => {
  logger.info("api", "PEA Portfolio API listening", { url: `http://127.0.0.1:${config.port}` });
  marketScheduler.start();
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    logger.error("api", "Port already in use", { port: config.port });
    process.exit(1);
  }

  logger.error("api", "Server error", { error });
  process.exit(1);
});
