import type { Migration } from "../types.js";

// Format produit par CURRENT_TIMESTAMP (UTC implicite) : "AAAA-MM-JJ HH:MM:SS".
// Node l'interprète en heure locale et SQLite le trie avant les dates ISO du même jour.
const sqliteTimestampGlob = "[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]";

export const transactionTradedAtIsoMigration: Migration = {
  version: 33,
  description: "Normalise en ISO UTC les dates de transactions issues de CURRENT_TIMESTAMP",
  appliquer: (db) => {
    db.prepare("UPDATE transactions SET traded_at = replace(traded_at, ' ', 'T') || '.000Z' WHERE traded_at GLOB ?").run(sqliteTimestampGlob);
  }
};
