/**
 * Role du fichier : point d'entree public du dossier Yahoo. Il expose les memes
 * exports que l'ancien service monolithique.
 */

import { YahooService } from "./yahoo.service.js";

export { isMarketDataUnavailable } from "./yahoo.errors.js";
export { YahooService } from "./yahoo.service.js";

export const yahooService = new YahooService();
