/**
 * Role du fichier : centraliser les conversions de dates pour les champs HTML datetime-local.
 */

/**
 * Convertit une date stockee en valeur acceptee par un input datetime-local.
 *
 * @param value Date ISO, SQLite ou vide.
 * @returns Valeur locale au format YYYY-MM-DDTHH:mm.
 */
export function toDateTimeLocalValue(value?: string) {
  if (!value) return "";
  return value.replace(" ", "T").slice(0, 16);
}

/**
 * Produit la date courante dans le format attendu par datetime-local.
 *
 * @param date Date de reference, utile en test ou initialisation.
 * @returns Valeur locale au format YYYY-MM-DDTHH:mm.
 */
export function currentDateTimeLocalValue(date = new Date()) {
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 16);
}
