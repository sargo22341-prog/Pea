import { yahooUsageFeatureForKey } from "../../services/yahoo/usage/yahoo-usage-feature.js";
import type { Migration } from "../types.js";

/** Classe chaque appel Yahoo journalisé par fonctionnalité, y compris l'historique existant. */
export const yahooUsageFeatureMigration: Migration = {
  version: 40,
  description: "Ajoute la fonctionnalite des appels Yahoo journalises",
  appliquer: (db) => {
    const columns = db.prepare("PRAGMA table_info(yahoo_usage_logs)").all() as { name: string }[];
    if (!columns.some((column) => column.name === "feature")) {
      db.exec("ALTER TABLE yahoo_usage_logs ADD COLUMN feature TEXT");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_yahoo_usage_logs_feature_created_at ON yahoo_usage_logs(feature, created_at)");
    const rows = db.prepare("SELECT id, request_key FROM yahoo_usage_logs WHERE feature IS NULL").all() as { id: number; request_key: string | null }[];
    const update = db.prepare("UPDATE yahoo_usage_logs SET feature = ? WHERE id = ?");
    for (const row of rows) update.run(yahooUsageFeatureForKey(row.request_key ?? ""), row.id);
  }
};
