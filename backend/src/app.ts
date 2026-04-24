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
import { HttpError } from "./utils/http-error.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();

app.set("etag", false);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));

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
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({ message: "Données invalides", details: error.flatten() });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({ message: error.message, details: error.details });
    return;
  }

  const message = error instanceof Error ? error.message : "Erreur inconnue";
  res.status(500).json({ message });
});
