import { addColumnIfMissing } from "../add-column.js";
import type { Migration } from "../types.js";

/**
 * Passage en historique complet (voir `shared/src/cash/cash-full-history.ts`) :
 *
 * - `cash_accounts.full_history_at` : date du passage, l'état initial étant remplacé par les
 *   opérations réelles des relevés espèces ;
 * - `cash_accounts.full_history_reference_at` : ancienne date de départ, conservée pour ne pas
 *   proposer à nouveau les dividendes qu'elle résumait (ils sont déjà des mouvements).
 *
 * Colonnes nullables : aucune donnée existante n'est modifiée.
 */
export const fullHistoryMigration: Migration = {
  version: 58,
  description: "Ajoute le passage du compte especes en historique complet",
  appliquer: (db) => {
    addColumnIfMissing(db, "cash_accounts", "full_history_at", "TEXT");
    addColumnIfMissing(db, "cash_accounts", "full_history_reference_at", "TEXT");
  }
};
