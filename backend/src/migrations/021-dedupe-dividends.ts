import type { Migration } from "./types.js";

export const dedupeDividendsMigration: Migration = {
  version: 21,
  description: "Dédoublonnage des dividendes corrigés par Yahoo à date identique",
  appliquer: (db) => {
    db.exec(`
      DELETE FROM asset_dividends
      WHERE id NOT IN (
        SELECT id
        FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY asset_id, ex_date
              ORDER BY datetime(updated_at) DESC, id DESC
            ) AS rang
          FROM asset_dividends
        )
        WHERE rang = 1
      )
    `);
  }
};
