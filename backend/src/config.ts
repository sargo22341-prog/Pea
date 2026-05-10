import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isValidTimeZone, zonedTimeToUtc } from "./services/timezone/date-time.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(__dirname, "../../.env");
const initialNodeEnv = process.env.NODE_ENV ?? "development";

if (initialNodeEnv !== "production") {
  dotenv.config({ path: rootEnvPath });
  dotenv.config();
}

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

export const config = {
  port: Number(process.env.PORT ?? 4000),
  sqlitePath: process.env.SQLITE_PATH ?? "./data/pea.sqlite",
  debug: process.env.DEBUG === "true",
  debugDate: parseDebugDate(process.env.DEBUG_DATE, appTimezone),
  frontendDist: process.env.FRONTEND_DIST ?? "../frontend/dist",
  nodeEnv: initialNodeEnv,
  appTimezone,
  logoDevApiKey: process.env.LOGO_DEV_API_KEY?.trim() || undefined,
  chartConfigPath: process.env.CHART_CONFIG_PATH ?? path.resolve(__dirname, "../../data/config.json"),
  enableMarketLiveRefresh: parseBoolean(process.env.ENABLE_MARKET_LIVE_REFRESH, false)
};
