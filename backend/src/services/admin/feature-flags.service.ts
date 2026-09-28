import { APP_FEATURE_KEYS, type AppFeatureFlag, type AppFeatureKey } from "@pea/shared";
import { db } from "../../db.js";
import { featureFlagsRepository } from "../../repositories/admin/feature-flags.repository.js";
import { HttpError } from "../../utils/http-error.js";
import { logger } from "../shared/logger.service.js";

/**
 * Valeurs par défaut : les fonctionnalités à coût Yahoo récurrent (signaux, actifs similaires,
 * comptes trimestriels) restent désactivées tant que l'administrateur n'a pas mesuré leur coût.
 */
export const FEATURE_DEFAULTS: Record<AppFeatureKey, boolean> = {
  extended_fundamentals: true,
  quarterly_statements: false,
  insights: false,
  similar_assets: false
};

function isFeatureKey(value: string): value is AppFeatureKey {
  return (APP_FEATURE_KEYS as readonly string[]).includes(value);
}

export class FeatureFlagsService {
  /** Lecture fréquente (chaque job Yahoo) : mémorisée jusqu'à la prochaine modification. */
  private cached: Map<AppFeatureKey, AppFeatureFlag> | undefined;

  list(): AppFeatureFlag[] {
    return [...this.flags().values()];
  }

  isEnabled(key: AppFeatureKey): boolean {
    return this.flags().get(key)?.enabled ?? FEATURE_DEFAULTS[key];
  }

  /** Refuse (403) toute action d'une fonctionnalité coupée, avant le moindre appel Yahoo. */
  assertEnabled(key: AppFeatureKey) {
    if (!this.isEnabled(key)) throw new HttpError(403, "Fonctionnalite desactivee par l'administrateur.");
  }

  enabledKeys(): AppFeatureKey[] {
    return this.list().filter((flag) => flag.enabled).map((flag) => flag.key);
  }

  update(changes: Partial<Record<AppFeatureKey, boolean | undefined>>, userId: number): AppFeatureFlag[] {
    db.transaction(() => {
      for (const key of APP_FEATURE_KEYS) {
        const enabled = changes[key];
        if (enabled !== undefined) featureFlagsRepository.upsert(key, enabled, userId);
      }
    });
    this.cached = undefined;
    logger.info("general", "feature flags updated", { userId, changes: JSON.stringify(changes) });
    return this.list();
  }

  private flags() {
    if (this.cached) return this.cached;
    const stored = new Map(featureFlagsRepository.list().filter((row) => isFeatureKey(row.key)).map((row) => [row.key, row]));
    this.cached = new Map(APP_FEATURE_KEYS.map((key) => {
      const row = stored.get(key);
      return [key, {
        key,
        enabled: row ? row.enabled === 1 : FEATURE_DEFAULTS[key],
        defaultEnabled: FEATURE_DEFAULTS[key],
        updatedAt: row?.updated_at,
        updatedBy: row?.updated_by_username ?? undefined
      }];
    }));
    return this.cached;
  }
}

export const featureFlagsService = new FeatureFlagsService();
