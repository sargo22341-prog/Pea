/**
 * Role du fichier : construire les cles de cache news de maniere centralisee.
 */

import type { NewsLanguage } from "@pea/shared";
import { normalizeSearchText } from "../utils/text.js";

export function newsCacheKey(symbol: string, language: NewsLanguage) {
  return `news:ticker:${symbol.toUpperCase()}:${language}`;
}

/** Cle separee du flux ticker pour les recherches directes par nom d'entreprise. */
export function companyNewsCacheKey(symbol: string, language: NewsLanguage, companyName: string) {
  return `news:company:${symbol.toUpperCase()}:${language}:${normalizeSearchText(companyName).slice(0, 80)}`;
}

export function globalNewsCacheKey(language: NewsLanguage) {
  return `news:global:v2:${language}`;
}
