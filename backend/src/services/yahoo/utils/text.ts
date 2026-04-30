/**
 * Role du fichier : fournir les helpers texte reutilises par les filtres news.
 */

/** Normalise une chaine pour des comparaisons insensibles aux accents et a la casse. */
export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Echappe une chaine avant de l'injecter dans une RegExp. */
export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
