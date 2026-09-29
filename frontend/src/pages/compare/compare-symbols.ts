import { COMPARE_MAX_SYMBOLS, COMPARE_MIN_SYMBOLS, YAHOO_SYMBOL_PATTERN } from "@pea/shared";

export type CompareSymbolsIssue = "tooMany" | "invalid";

/**
 * Lit `?symbols=A,B,C` : majuscules, doublons retirés. Un symbole mal formé ou un cinquième actif
 * est écarté et signalé, pour que la page reste utilisable avec les actifs valides.
 */
export function parseCompareSymbols(raw: string | null): { symbols: string[]; issue?: CompareSymbolsIssue } {
  const requested = [...new Set((raw ?? "").split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  const valid = requested.filter((symbol) => YAHOO_SYMBOL_PATTERN.test(symbol));
  const symbols = valid.slice(0, COMPARE_MAX_SYMBOLS);
  if (valid.length < requested.length) return { symbols, issue: "invalid" };
  if (symbols.length < valid.length) return { symbols, issue: "tooMany" };
  return { symbols };
}

export function canCompare(symbols: readonly string[]) {
  return symbols.length >= COMPARE_MIN_SYMBOLS && symbols.length <= COMPARE_MAX_SYMBOLS;
}

/** Lien vers le comparateur, depuis la fiche actif, les actifs similaires ou la page Marchés. */
export function compareLink(symbols: readonly string[]) {
  return symbols.length ? `/compare?symbols=${symbols.map(encodeURIComponent).join(",")}` : "/compare";
}
