// Constantes TTL centralisées pour la couche Yahoo / cache local.
//
// Deux seuils par type de donnée :
//   - *_FRESH_TTL_S    : durée pendant laquelle la donnée en cache est considérée "fraîche".
//                        Au-delà, le client tente un appel Yahoo ; si Yahoo échoue, on peut servir
//                        le cache en "stale" tant qu'il n'a pas dépassé STALE_REJECT.
//   - *_STALE_REJECT_S : âge maximum au-delà duquel la donnée en cache est rejetée même comme
//                        fallback. Au-delà de ce seuil, readCache retourne null et le service
//                        appelant doit lever une erreur "marketDataUnavailable" plutôt que d'afficher
//                        un prix d'il y a 1 an.
//
// Toute modification doit rester cohérente avec safeYahooCall (yahoo.client.ts) qui gère les
// fallbacks et avec les helpers stale.ts qui calculent l'âge réel.

const SECOND = 1;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Quotes : prix instantanés. Très volatiles, mais on autorise un fallback de 7 jours en cas de
// panne Yahoo prolongée afin de pouvoir afficher le portefeuille même sans connexion.
export const QUOTE_FRESH_TTL_S = 60 * SECOND;
export const QUOTE_STALE_REJECT_S = 7 * DAY;

// QuoteCombine : agrégation mémoire courte pour les batches (search/dashboard).
export const QUOTE_COMBINE_FRESH_TTL_S = 60 * SECOND;
export const QUOTE_COMBINE_STALE_REJECT_S = 6 * HOUR;

// Recherche Yahoo : résultats de search. Suffisamment stable pour 24h.
export const SEARCH_FRESH_TTL_S = 24 * HOUR;
export const SEARCH_STALE_REJECT_S = 7 * DAY;

// Historiques 1d (intraday) : nécessite la fraîcheur intra-jour. Le cache n'est servi en stale
// que dans une fenêtre courte (un jour ouvré) pour éviter d'afficher l'historique de la veille.
export const HISTORY_INTRADAY_FRESH_TTL_S = 15 * MINUTE;
export const HISTORY_INTRADAY_STALE_REJECT_S = 2 * DAY;

// Historiques 1w : agrégation hebdomadaire, fraîche pendant 15 minutes, rejet à 14 jours.
export const HISTORY_WEEK_FRESH_TTL_S = 15 * MINUTE;
export const HISTORY_WEEK_STALE_REJECT_S = 14 * DAY;

// Historiques 1m / 1y / 5y / 10y / all : moins volatiles, fraîche pendant 1h, rejet à 30 jours.
export const HISTORY_LONG_FRESH_TTL_S = 1 * HOUR;
export const HISTORY_LONG_STALE_REJECT_S = 30 * DAY;

// News : flux d'articles. Fraîche pendant 6h, rejet à 7 jours.
export const NEWS_FRESH_TTL_S = 6 * HOUR;
export const NEWS_STALE_REJECT_S = 7 * DAY;

// Dividendes : événements rares, fraîche pendant 12h, rejet à 90 jours (un trimestre).
export const DIVIDENDS_FRESH_TTL_S = 12 * HOUR;
export const DIVIDENDS_STALE_REJECT_S = 90 * DAY;

// Fundamentals (quoteSummary + financials) : très stables, fraîche pendant 7 jours, rejet à 60
// jours pour éviter d'afficher des fondamentaux trop vieux dans /analysis.
export const FUNDAMENTALS_FRESH_TTL_S = 7 * DAY;
export const FUNDAMENTALS_STALE_REJECT_S = 60 * DAY;

// Frontend block cache (DTO portfolio summary, analysis, dividendes, watchlist).
// TTL gouvernés par chartConfigService côté front, mais on définit une borne de rejet
// applicable par cache-service.
export const FRONTEND_BLOCK_STALE_REJECT_S = 24 * HOUR;
