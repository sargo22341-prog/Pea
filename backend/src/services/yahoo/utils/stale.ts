/**
 * Role du fichier : regrouper les helpers de fraicheur de cache et de marquage
 * stale partages par les jobs Yahoo.
 */

import type { RangeKey } from "@pea/shared";
import { getLastTradingDay } from "../../market/calendars/marketCalendar.service.js";

export const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Ajoute le flag stale attendu par certains DTO sans modifier l'objet d'origine. */
export function markStale<T extends object>(data: T, stale: boolean): T & { stale?: boolean } {
  return { ...data, stale };
}

/** Ajoute le flag stale a toute une liste. */
export function markStaleList<T extends object>(data: T[], stale: boolean): Array<T & { stale?: boolean }> {
  return data.map((item) => markStale(item, stale));
}

/** Un cache n'expire que lorsque le marche concerne est ouvert. */
export function cacheIsStale(symbol: string, exchange: string | undefined, fetchedAtSeconds: number, ttlSeconds: number) {
  void symbol;
  void exchange;
  return nowSeconds() - fetchedAtSeconds > ttlSeconds;
}

/** Reprend la regle historique des caches chart 1d/1w. */
export function historyCacheIsStale(symbol: string, range: RangeKey, fetchedAtSeconds: number) {
  if (range !== "1d" && range !== "1w") {
    return nowSeconds() - fetchedAtSeconds > 60 * 60;
  }
  const lastCloseAtSeconds = Math.floor(getLastTradingDay(symbol).period2.getTime() / 1000);
  return fetchedAtSeconds < lastCloseAtSeconds;
}
