import { createContext, use, useState } from "react";
import { readBooleanPreference, writeLocalPreference } from "../../../lib/local-preference";

/**
 * Préférence utilisateur « mode avancé » : les blocs de détail sont dépliés d'office.
 * Fournie par la page (voir `AssetDetailPage`) à partir du profil de l'utilisateur.
 */
export const AdvancedModeContext = createContext(false);

export function useAdvancedMode() {
  return use(AdvancedModeContext);
}

/**
 * État ouvert/fermé d'un bloc repliable, mémorisé par navigateur sous `details.<key>`.
 * Sans choix mémorisé, le bloc suit le mode avancé.
 */
export function useDisclosureState(storageKey: string) {
  const advancedMode = useAdvancedMode();
  const preferenceKey = `details.${storageKey}`;
  const [open, setOpen] = useState(() => readBooleanPreference(preferenceKey) ?? advancedMode);

  function toggle() {
    setOpen((current) => {
      const next = !current;
      writeLocalPreference(preferenceKey, String(next));
      return next;
    });
  }

  return { open, toggle };
}
