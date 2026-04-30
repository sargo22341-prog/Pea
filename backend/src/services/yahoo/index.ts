/**
 * Role du fichier : point d'entree public du dossier Yahoo. Il expose les memes
 * exports que l'ancien service monolithique.
 */

import type { MarketDataProvider } from "../market/market-data-provider.js";
import { YahooService } from "./yahoo.service.js";

export { yahooClient } from "./yahoo.client.js";
export { isMarketDataUnavailable, isTemporaryYahooError } from "./yahoo.errors.js";
export { YahooService } from "./yahoo.service.js";

export const yahooService = new YahooService();
export const marketDataProvider: MarketDataProvider = yahooService;
