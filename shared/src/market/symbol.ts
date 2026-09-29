/**
 * Symbole Yahoo accepté aux frontières (routes, liens partagés) : lettres majuscules, chiffres et
 * séparateurs de place, d'indice ou de devise (`AI.PA`, `^FCHI`, `EURUSD=X`).
 */
export const YAHOO_SYMBOL_PATTERN = /^\^?[A-Z0-9][A-Z0-9.=-]{0,30}$/;
