import { addColumnIfMissing } from "../add-column.js";
import type { Migration } from "../types.js";

/**
 * Ajout automatique des dividendes sûrs : réglage par compte espèces (désactivé par défaut) et,
 * sur chaque proposition, la trace d'un ajout sans clic et la lecture de sa notification.
 */
export const dividendAutomationMigration: Migration = {
  version: 49,
  description: "Ajoute l'ajout automatique des dividendes surs et leurs notifications",
  appliquer: (db) => {
    addColumnIfMissing(db, "cash_accounts", "dividend_auto_accept", "INTEGER NOT NULL DEFAULT 0 CHECK(dividend_auto_accept IN (0, 1))");
    addColumnIfMissing(db, "cash_dividend_proposals", "auto_accepted", "INTEGER NOT NULL DEFAULT 0 CHECK(auto_accepted IN (0, 1))");
    addColumnIfMissing(db, "cash_dividend_proposals", "notification_read_at", "TEXT");
  }
};
