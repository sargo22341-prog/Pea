import type { ColonneDb, Migration } from "./types.js";

/**
 * Ajoute une colonne `priority` sur `data_construction_tasks` pour permettre une queue
 * concurrente avec ordonnancement (finalize > snapshot > candles > rebuild-stored > financials
 * > dividends > calendar-events). La priorité est un entier (plus petit = plus prioritaire).
 *
 * Les tâches existantes en attente sont rétro-attribuées à leur priorité naturelle selon le
 * type, afin de ne pas bloquer la queue après l'upgrade.
 */
export const dataConstructionPriorityMigration: Migration = {
  version: 26,
  description: "Ajoute la colonne priority sur data_construction_tasks et indexe pour le claim",
  appliquer: (db) => {
    const colonnes = db.prepare("PRAGMA table_info(data_construction_tasks)").all() as ColonneDb[];
    const noms = new Set(colonnes.map((ligne) => ligne.name));
    if (!noms.has("priority")) {
      db.exec("ALTER TABLE data_construction_tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 100");
    }

    db.exec(`
      UPDATE data_construction_tasks SET priority = 10 WHERE type = 'finalize';
      UPDATE data_construction_tasks SET priority = 20 WHERE type = 'snapshot';
      UPDATE data_construction_tasks SET priority = 30 WHERE type = 'candles';
      UPDATE data_construction_tasks SET priority = 40 WHERE type = 'rebuild-stored';
      UPDATE data_construction_tasks SET priority = 50 WHERE type = 'financials';
      UPDATE data_construction_tasks SET priority = 60 WHERE type = 'dividends';
      UPDATE data_construction_tasks SET priority = 70 WHERE type = 'calendar-events';
    `);

    db.exec("DROP INDEX IF EXISTS idx_data_construction_tasks_status_id");
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_data_construction_tasks_status_priority_id
         ON data_construction_tasks(status, priority, id)`
    );
  }
};
