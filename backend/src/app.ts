import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { config } from "./config.js";
import "./db.js";
import { createRateLimit } from "./middleware/rate-limit.js";
import { apiRouter } from "./routes/api.js";
import { logger } from "./services/shared/logger.service.js";
import { HttpError } from "./utils/http-error.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devCorsOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);

export const app = express();

// Active uniquement derriere un reverse proxy de confiance, afin que req.ip
// utilise l'adresse client transmise par le proxy pour le rate-limit.
if (config.trustProxy) {
  app.set("trust proxy", 1);
}
app.set("etag", false);
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "https:"],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"]
      }
    }
  })
);
if (config.nodeEnv !== "production") {
  app.use(
    cors({
      credentials: true,
      origin: (origin, callback) => callback(null, origin && devCorsOrigins.has(origin) ? origin : false)
    })
  );
}
app.use(express.json());
if (config.debug) {
  app.use(
    morgan(config.nodeEnv === "production" ? "combined" : "dev", {
      stream: { write: (message) => logger.debug("api", "request timing", { message: message.trim() }) }
    })
  );
}

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});
app.use("/api", createRateLimit({ windowMs: 60_000, max: 120 }));
app.use("/api", apiRouter);

if (config.nodeEnv === "production") {
  const frontendDist = path.resolve(__dirname, config.frontendDist);
  app.use(express.static(frontendDist));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    logger.warn("api", "validation error", { details: error.flatten() });
    res.status(400).json({ message: "Données invalides", details: error.flatten() });
    return;
  }

  if (error instanceof HttpError) {
    if (error.status >= 500) logger.error("api", "HTTP error", { status: error.status, message: error.message, details: error.details });
    else logger.warn("api", "HTTP error", { status: error.status, message: error.message, details: error.details });
    res.status(error.status).json({ message: error.message, details: error.details });
    return;
  }

  logger.error("api", "Unhandled error", { error });
  res.status(500).json({ message: "Erreur interne du serveur." });
});
