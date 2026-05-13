import { createContext, useContext, type ReactNode } from "react";

interface PrivacyContextValue {
  /** Vrai si les chiffres du portefeuille doivent être masqués. */
  privacyEnabled: boolean;
}

const PrivacyContext = createContext<PrivacyContextValue>({ privacyEnabled: false });

export function PrivacyProvider({ privacyEnabled, children }: { privacyEnabled: boolean; children: ReactNode }) {
  return <PrivacyContext.Provider value={{ privacyEnabled }}>{children}</PrivacyContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePrivacy(): boolean {
  return useContext(PrivacyContext).privacyEnabled;
}
