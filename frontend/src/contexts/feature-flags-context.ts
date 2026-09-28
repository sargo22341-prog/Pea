import type { AppFeatureKey } from "@pea/shared";
import { createContext, use } from "react";

/** Fonctionnalités activées par l'administrateur, reçues avec la session (`/api/auth/me`). */
export const FeatureFlagsContext = createContext<readonly AppFeatureKey[]>([]);

export function useFeatureEnabled(key: AppFeatureKey): boolean {
  return use(FeatureFlagsContext).includes(key);
}
