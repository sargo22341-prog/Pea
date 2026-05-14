import type { DatabaseAdapter } from "../db-adapter.js";

export interface Migration {
  version: number;
  description: string;
  appliquer: (db: DatabaseAdapter) => void;
  /**
   * Rollback optionnel.
   *
   * Convention :
   *   - Pour les migrations idempotentes (ALTER ADD COLUMN IF NOT EXISTS, CREATE INDEX),
   *     `defaire` n'est pas nécessaire — la migration peut être ré-appliquée.
   *   - Pour les migrations destructives (DROP TABLE, RENAME, schema split), `defaire` doit
   *     restaurer la structure d'origine pour permettre une revert d'urgence en cas de bug
   *     en prod. Les données déplacées sont perdues si elles n'ont pas été préservées par
   *     une copie pendant le `appliquer`.
   *
   * Aucun mécanisme automatique de rollback n'existe : c'est volontaire — un revert doit
   * être déclenché explicitement par un opérateur (ex: script CLI à ajouter au besoin).
   */
  defaire?: (db: DatabaseAdapter) => void;
}

export interface ColonneDb {
  name: string;
  type: string;
}
