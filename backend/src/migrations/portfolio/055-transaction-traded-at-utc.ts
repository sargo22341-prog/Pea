import { config } from "../../config.js";
import { toUtcIso } from "../../services/timezone/wall-clock.js";
import type { Migration } from "../types.js";

interface TradedAtRow {
  id: number;
  traded_at: string;
}

/**
 * Les avis d'opéré importés avant la normalisation stockaient l'heure imprimée sans fuseau
 * (`2021-07-08T09:00:05`), lue par Node dans le fuseau du processus ; les récents sont en ISO UTC.
 * Chaque date sans fuseau devient l'instant UTC de cette heure murale dans le fuseau de
 * l'application (heure d'été comprise) : l'instant lu par l'application ne change pas, seul son
 * format devient uniforme. Une date déjà en UTC n'est pas modifiée (migration rejouable).
 */
export const transactionTradedAtUtcMigration: Migration = {
  version: 55,
  description: "Normalise en ISO UTC les dates de transactions enregistrees sans fuseau",
  sauvegardeAvant: true,
  appliquer: (db) => {
    const rows = db.prepare("SELECT id, traded_at FROM transactions WHERE traded_at NOT LIKE '%Z'").all() as TradedAtRow[];
    const update = db.prepare("UPDATE transactions SET traded_at = ? WHERE id = ?");
    for (const row of rows) {
      const normalized = toUtcIso(row.traded_at, config.appTimezone);
      if (normalized && normalized !== row.traded_at) update.run(normalized, row.id);
    }
  }
};
