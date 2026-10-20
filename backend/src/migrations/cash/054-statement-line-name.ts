import { addColumnIfMissing } from "../add-column.js";
import type { Migration } from "../types.js";

/**
 * Nom de la valeur des lignes de relevé certifiées avant l'état initial, lu sur le relevé et
 * affiché quand aucune position ne porte l'ISIN. Nullable : les lignes déjà importées le reçoivent
 * au prochain réimport de leur relevé.
 */
export const statementLineNameMigration: Migration = {
  version: 54,
  description: "Ajoute le nom de la valeur aux lignes de releve certifiees",
  appliquer: (db) => {
    addColumnIfMissing(db, "cash_dividend_statement_lines", "name", "TEXT");
  }
};
