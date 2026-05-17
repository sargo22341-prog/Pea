import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isValidTimeZone, zonedTimeToUtc } from "./services/timezone/date-time.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "../..");
const appDataDir = path.join(appRoot, "data");
const rootEnvPath = path.resolve(__dirname, "../../.env");

if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: rootEnvPath });
  dotenv.config();
}

const initialNodeEnv = process.env.NODE_ENV ?? "production";

const fallbackTimezone = "Europe/Paris";
const configuredTimezone = process.env.TZ?.trim() || fallbackTimezone;
const appTimezone = isValidTimeZone(configuredTimezone) ? configuredTimezone : fallbackTimezone;

function parseDebugDate(value: string | undefined, timeZone: string) {
  const raw = value?.trim();
  if (!raw) return undefined;

  const localMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/);
  if (localMatch) return zonedTimeToUtc(localMatch[1], localMatch[2], timeZone);

  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function parseBoolean(value: string | undefined, fallback = false) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
}

function parsePublicUrl(value: string | undefined) {
  const raw = value?.trim();
  if (!raw) return undefined;
  try {
    return new URL(raw).origin;
  } catch {
    return undefined;
  }
}

function parseOriginList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function frontendDistPath() {
  const dockerPath = path.join(appRoot, "frontend-dist");
  if (fs.existsSync(dockerPath)) return dockerPath;
  return path.join(appRoot, "frontend", "dist");
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  sqlitePath: process.env.PEA_TEST_SQLITE_PATH ?? path.join(appDataDir, "pea.sqlite"),
  debug: process.env.DEBUG === "true",
  debugDate: parseDebugDate(process.env.DEBUG_DATE, appTimezone),
  frontendDist: frontendDistPath(),
  nodeEnv: initialNodeEnv,
  appTimezone,
  logoDevApiKey: process.env.LOGO_DEV_API_KEY?.trim() || undefined,
  chartConfigPath: path.join(appDataDir, "config.json"),
  enableMarketLiveRefresh: parseBoolean(process.env.ENABLE_MARKET_LIVE_REFRESH, true),
  publicUrl: parsePublicUrl(process.env.PUBLIC_URL),
  trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
  corsOrigins: parseOriginList(process.env.CORS_ORIGINS)
};
