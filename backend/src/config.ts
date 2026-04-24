import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  sqlitePath: process.env.SQLITE_PATH ?? "./data/pea.sqlite",
  yahooCacheTtlSeconds: Number(process.env.YAHOO_CACHE_TTL_SECONDS ?? 300),
  frontendDist: process.env.FRONTEND_DIST ?? "../frontend/dist",
  nodeEnv: process.env.NODE_ENV ?? "development",
  debugMarketData: process.env.DEBUG_MARKET_DATA === "1" || process.env.DEBUG_MARKET_DATA === "true"
};
