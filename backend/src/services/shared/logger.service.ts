import path from "node:path";
import util from "node:util";
import { config } from "../../config.js";
import { LogFileWriter } from "./log-file-writer.js";

export type LogCategory =
  | "cache"
  | "market-data"
  | "search"
  | "chart"
  | "portfolio"
  | "import"
  | "icons"
  | "news"
  | "auth"
  | "api"
  | "general";

type LogLevel = "debug" | "info" | "warn" | "error";

const categories = new Set<LogCategory>([
  "cache",
  "market-data",
  "search",
  "chart",
  "portfolio",
  "import",
  "icons",
  "news",
  "auth",
  "api",
  "general"
]);

function isDebugEnabled() {
  return process.env["DEBUG"] === "true";
}

function logDirectory() {
  return path.join(path.dirname(config.sqlitePath), "log");
}

function sanitizeMeta(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map(sanitizeMeta);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (/(password|hash|cookie|token|api[_-]?key|secret)/i.test(key)) return [key, "[redacted]"];
      return [key, sanitizeMeta(item)];
    })
  );
}

function formatMeta(meta?: unknown) {
  if (meta === undefined) return "";
  try {
    return ` ${JSON.stringify(sanitizeMeta(meta))}`;
  } catch {
    return ` ${util.inspect(meta, { depth: 4, breakLength: Infinity })}`;
  }
}

/** 5 Mo par fichier et 3 archives : au plus 20 Mo par catégorie de log. */
const logFileWriter = new LogFileWriter({
  directory: logDirectory,
  maxFileBytes: 5 * 1024 * 1024,
  rotatedFiles: 3,
  maxPendingBytes: 1024 * 1024
});

function writeJsonLine(entry: { timestamp: string; level: LogLevel; category: LogCategory; message: string; meta?: unknown }) {
  const line = `${JSON.stringify(entry)}\n`;
  logFileWriter.append(`${entry.category}.log`, line);
  if (entry.level === "error") logFileWriter.append("error.log", line);
}

function log(level: LogLevel, category: LogCategory, message: string, meta?: unknown) {
  if (!categories.has(category)) category = "general";
  const debugEnabled = isDebugEnabled();
  // Auparavant : seul `error` passait en mode non-debug, ce qui rendait toute alerte WARN
  // (brute-force, fallback Yahoo, retry temporaire) invisible en production. On laisse
  // désormais passer info/warn/error en console en permanence ; les fichiers JSON détaillés
  // restent réservés au mode DEBUG pour ne pas saturer le disque.
  if (level === "debug" && !debugEnabled) return;

  const timestamp = new Date().toISOString();
  const cleanMeta = meta === undefined ? undefined : sanitizeMeta(meta);
  const line = `[${timestamp}] [${level}] [${category}] ${message}${formatMeta(cleanMeta)}`;

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "info") console.info(line);
  else console.debug(line);

  if (debugEnabled || level === "warn" || level === "error") {
    writeJsonLine({ timestamp, level, category, message, meta: cleanMeta });
  }
}

export const logger = {
  debug: (category: LogCategory, message: string, meta?: unknown) => { log("debug", category, message, meta); },
  info: (category: LogCategory, message: string, meta?: unknown) => { log("info", category, message, meta); },
  warn: (category: LogCategory, message: string, meta?: unknown) => { log("warn", category, message, meta); },
  error: (category: LogCategory, message: string, meta?: unknown) => { log("error", category, message, meta); },
  isDebugEnabled,
  /** Attend l'écriture des logs en attente, avant l'arrêt du processus. */
  flush: () => logFileWriter.flush()
};
