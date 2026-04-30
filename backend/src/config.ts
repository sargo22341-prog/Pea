import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isValidTimeZone } from "./services/timezone/date-time.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(__dirname, "../../.env");

dotenv.config({ path: rootEnvPath });
dotenv.config();

const fallbackTimezone = "Europe/Paris";
const configuredTimezone = process.env.APP_TIMEZONE?.trim() || fallbackTimezone;

export const config = {
  port: Number(process.env.PORT ?? 4000),
  sqlitePath: process.env.SQLITE_PATH ?? "./data/pea.sqlite",
  yahooCacheTtlSeconds: 0,
  debug: process.env.DEBUG === "true",
  frontendDist: process.env.FRONTEND_DIST ?? "../frontend/dist",
  nodeEnv: process.env.NODE_ENV ?? "development",
  appTimezone: isValidTimeZone(configuredTimezone) ? configuredTimezone : fallbackTimezone,
  logoDevApiKey: process.env.LOGO_DEV_API_KEY?.trim() || undefined,
  chartConfigPath: process.env.CHART_CONFIG_PATH ?? path.resolve(__dirname, "../../data/config.json")
};
