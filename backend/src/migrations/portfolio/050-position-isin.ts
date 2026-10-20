import { addColumnIfMissing } from "../add-column.js";
import type { Migration } from "../types.js";

/**
 * ISIN saisi sur une position : il identifie le pays de la société pour la retenue à la source
 * des dividendes quand aucun avis d'opéré importé ne l'a fourni.
 */
export const positionIsinMigration: Migration = {
  version: 50,
  description: "Ajoute l'ISIN facultatif des positions",
  appliquer: (db) => {
    addColumnIfMissing(db, "positions", "isin", "TEXT");
  }
};
