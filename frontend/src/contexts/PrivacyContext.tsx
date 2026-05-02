/**
 * Rôle du fichier : fournir le contexte de mode privé à toute l'application.
 * Quand le mode privé est actif, les chiffres liés au portefeuille de
 * l'utilisateur sont masqués et remplacés par des étoiles.
 */

import { createContext, useContext, type ReactNode } from "react";

interface PrivacyContextValue {
  /** Vrai si les chiffres du portefeuille doivent être masqués. */
  privacyEnabled: boolean;
}

const PrivacyContext = createContext<PrivacyContextValue>({ privacyEnabled: false });

export function PrivacyProvider({ privacyEnabled, children }: { privacyEnabled: boolean; children: ReactNode }) {
  return <PrivacyContext.Provider value={{ privacyEnabled }}>{children}</PrivacyContext.Provider>;
}

/** Retourne vrai si le mode privé est actif. */
export function usePrivacy(): boolean {
  return useContext(PrivacyContext).privacyEnabled;
}
