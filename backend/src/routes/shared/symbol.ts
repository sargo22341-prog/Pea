import { z } from "zod";

/** Symbole Yahoo : lettres, chiffres et séparateurs de place, d'indice ou de devise (`AI.PA`, `^FCHI`, `EURUSD=X`). */
export const YAHOO_SYMBOL_PATTERN = /^\^?[A-Z0-9][A-Z0-9.=-]{0,30}$/;

/** Symbole normalisé en majuscules puis validé. */
export const yahooSymbolSchema = z.string().trim().toUpperCase().regex(YAHOO_SYMBOL_PATTERN);
