import fs from "node:fs";
import path from "node:path";
import type { YahooSummaryRaw } from "../../services/yahoo/yahoo.raw.js";

const fixturesDir = path.resolve(import.meta.dirname, "..", "fixtures", "yahoo");

/** Réponse Yahoo réelle enregistrée (voir `fixtures/yahoo`), relue comme depuis le cache JSON. */
export function yahooFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

/**
 * Résumé `quoteSummary` enregistré. Les mappers sont tolérants par conception : le fichier JSON
 * est typé comme une réponse relue du cache, sans validation supplémentaire.
 */
export function yahooSummaryFixture(name: "euronext-stock" | "euronext-bank" | "etf-with-returns" | "etf-with-holdings" | "empty"): YahooSummaryRaw {
  return yahooFixture(`${name}.summary.json`) as YahooSummaryRaw;
}
