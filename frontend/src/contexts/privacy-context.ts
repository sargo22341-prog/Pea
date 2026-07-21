import { createContext, useContext } from "react";

export interface PrivacyContextValue {
  privacyEnabled: boolean;
}

export const PrivacyContext = createContext<PrivacyContextValue>({ privacyEnabled: false });

export function usePrivacy(): boolean {
  return useContext(PrivacyContext).privacyEnabled;
}
