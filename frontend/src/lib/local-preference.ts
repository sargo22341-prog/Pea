/**
 * Préférences de confort propres au navigateur (bloc déplié, filtre, calques du graphique).
 *
 * Le stockage peut être absent ou refuser l'accès (navigation privée, données bloquées) : chaque
 * lecture et écriture est protégée et l'interface garde son comportement par défaut.
 */
const PREFIX = "pea.";

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function readLocalPreference(key: string): string | null {
  try {
    return storage()?.getItem(PREFIX + key) ?? null;
  } catch {
    return null;
  }
}

/** Écrit une préférence ; un stockage indisponible est ignoré sans casser l'interface. */
export function writeLocalPreference(key: string, value: string) {
  try {
    storage()?.setItem(PREFIX + key, value);
  } catch {
    // Stockage plein ou refusé : la préférence reste valable pour la session en cours seulement.
  }
}

export function readBooleanPreference(key: string): boolean | undefined {
  const value = readLocalPreference(key);
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}
