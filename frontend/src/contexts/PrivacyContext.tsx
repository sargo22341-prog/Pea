import type { ReactNode } from "react";
import { PrivacyContext } from "./privacy-context";

export function PrivacyProvider({ privacyEnabled, children }: { privacyEnabled: boolean; children: ReactNode }) {
  return <PrivacyContext.Provider value={{ privacyEnabled }}>{children}</PrivacyContext.Provider>;
}
