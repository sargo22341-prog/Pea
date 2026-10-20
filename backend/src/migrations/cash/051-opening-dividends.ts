import { addColumnIfMissing } from "../add-column.js";
import type { Migration } from "../types.js";

/**
 * Dividendes perçus avant la date de l'état initial, confirmés par l'utilisateur (centimes ;
 * `NULL` tant qu'aucun montant n'est confirmé). Purement indicatif : déjà compris dans le solde
 * espèces déclaré, ils ne modifient ni le solde ni les versements.
 */
export const openingDividendsMigration: Migration = {
  version: 51,
  description: "Ajoute les dividendes percus avant l'etat initial du compte especes",
  appliquer: (db) => {
    addColumnIfMissing(db, "cash_accounts", "opening_dividends_cents", "INTEGER CHECK(opening_dividends_cents >= 0)");
  }
};
