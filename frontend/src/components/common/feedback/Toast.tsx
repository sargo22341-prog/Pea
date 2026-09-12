import type { ReactNode } from "react";
import type { SettingsToast } from "./types";
import { MOTION } from "../motion";

export function Toast({ tone, children }: { tone: SettingsToast["tone"]; children: ReactNode }) {
  return (
    <p className={`rounded-md border p-3 text-sm ${MOTION.fadeIn} ${tone === "success" ? "border-mint/40 bg-mint/10 text-mint" : "border-coral/40 bg-coral/10 text-coral"}`}>
      {children}
    </p>
  );
}
