import { db } from "../../db.js";

/** Liste JSON des symboles normalisés (majuscules, sans doublon) pour `json_each`. */
function symbolsParameter(symbols: string[]) {
  return JSON.stringify([...new Set(symbols.map((symbol) => symbol.toUpperCase()))]);
}

/** Types de suivi d'un utilisateur concernés par une mise à jour de marché. */
export interface UserSymbolImpact {
  portfolio: boolean;
  watchlist: boolean;
}

/**
 * Lectures inter-utilisateurs du rafraîchissement live. Les listes de symboles passent en un
 * seul paramètre JSON (`json_each`) : une unique requête préparée quelle que soit leur taille.
 */
export class LiveRefreshRepository {
  /** Utilisateurs (clé texte) détenant ou suivant au moins un des symboles. */
  userImpactsForSymbols(symbols: string[]): Map<string, UserSymbolImpact> {
    const result = new Map<string, UserSymbolImpact>();
    if (!symbols.length) return result;
    const rows = db.prepare(
      `SELECT user_id, 'portfolio' AS source FROM positions WHERE symbol IN (SELECT value FROM json_each(?))
       UNION
       SELECT user_id, 'watchlist' AS source FROM watchlist WHERE symbol IN (SELECT value FROM json_each(?))`
    ).all(symbolsParameter(symbols), symbolsParameter(symbols)) as { user_id: number; source: "portfolio" | "watchlist" }[];
    for (const row of rows) {
      const userId = String(row.user_id);
      const impact = result.get(userId) ?? { portfolio: false, watchlist: false };
      impact[row.source] = true;
      result.set(userId, impact);
    }
    return result;
  }

  portfolioSymbolsForSymbols(symbols: string[]): string[] {
    if (!symbols.length) return [];
    const rows = db.prepare("SELECT DISTINCT symbol FROM positions WHERE symbol IN (SELECT value FROM json_each(?))").all(symbolsParameter(symbols)) as { symbol: string }[];
    return rows.map((row) => row.symbol.toUpperCase());
  }
}

export const liveRefreshRepository = new LiveRefreshRepository();
