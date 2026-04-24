import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const logPath = path.resolve(process.cwd(), "../data/market-debug.log");

export function marketDebug(scope: string, payload: Record<string, unknown>) {
  if (!config.debugMarketData) return;

  const entry = {
    timestamp: new Date().toISOString(),
    scope,
    ...payload
  };
  const line = JSON.stringify(entry, null, 2);

  console.log(line);

  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${line}\n`);
  } catch (error) {
    console.warn(`[market-debug] impossible d’écrire le fichier de log: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function marketDebugLogPath() {
  return logPath;
}
