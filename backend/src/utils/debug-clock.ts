import type { RangeKey } from "@pea/shared";
import { config } from "../config.js";

/**
 * Horloge intraday forcée par `DEBUG_DATE`. Ne s'applique qu'à la plage 1d afin de simuler
 * une séance ouverte sans modifier les autres plages.
 */
export function intradayDebugClock(range: RangeKey) {
  if (range !== "1d" || !config.debugDate) return undefined;
  return {
    forceIntradayOpen: true,
    intradayNow: config.debugDate
  };
}
