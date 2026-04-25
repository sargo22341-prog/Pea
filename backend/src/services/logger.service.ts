import fs from "node:fs";
import path from "node:path";
import util from "node:util";

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
  return process.env.DEBUG === "true";
}

function logDirectory() {
  return path.join(path.dirname(process.env.SQLITE_PATH ?? "./data/pea.sqlite"), "log");
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

function writeJsonLine(entry: { timestamp: string; level: LogLevel; category: LogCategory; message: string; meta?: unknown }) {
  try {
    fs.mkdirSync(logDirectory(), { recursive: true });
    const line = `${JSON.stringify(entry)}\n`;
    fs.appendFileSync(path.join(logDirectory(), `${entry.category}.log`), line, "utf8");
    if (entry.level === "error") {
      fs.appendFileSync(path.join(logDirectory(), "error.log"), line, "utf8");
    }
  } catch (error) {
    console.error(`[logger] unable to write log file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function log(level: LogLevel, category: LogCategory, message: string, meta?: unknown) {
  if (!categories.has(category)) category = "general";
  const debugEnabled = isDebugEnabled();
  if (level !== "error" && !debugEnabled) return;

  const timestamp = new Date().toISOString();
  const cleanMeta = meta === undefined ? undefined : sanitizeMeta(meta);
  const line = `[${timestamp}] [${level}] [${category}] ${message}${formatMeta(cleanMeta)}`;

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "info") console.info(line);
  else console.debug(line);

  if (debugEnabled) writeJsonLine({ timestamp, level, category, message, meta: cleanMeta });
}

export const logger = {
  debug: (category: LogCategory, message: string, meta?: unknown) => log("debug", category, message, meta),
  info: (category: LogCategory, message: string, meta?: unknown) => log("info", category, message, meta),
  warn: (category: LogCategory, message: string, meta?: unknown) => log("warn", category, message, meta),
  error: (category: LogCategory, message: string, meta?: unknown) => log("error", category, message, meta),
  isDebugEnabled
};
