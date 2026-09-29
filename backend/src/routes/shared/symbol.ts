import { YAHOO_SYMBOL_PATTERN } from "@pea/shared";
import { z } from "zod";

/** Symbole Yahoo normalisé en majuscules puis validé (`AI.PA`, `^FCHI`, `EURUSD=X`). */
export const yahooSymbolSchema = z.string().trim().toUpperCase().regex(YAHOO_SYMBOL_PATTERN);
