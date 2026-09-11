import { useMemo, type ReactNode } from "react";
import { PrivacyContext } from "./privacy-context";

export function PrivacyProvider({ privacyEnabled, children }: { privacyEnabled: boolean; children: ReactNode }) {
  // Valeur stable : évite de re-rendre tous les consommateurs (graphiques mémoïsés) à chaque navigation.
  const value = useMemo(() => ({ privacyEnabled }), [privacyEnabled]);
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}
