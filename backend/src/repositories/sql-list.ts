/**
 * Liste de valeurs passée en un seul paramètre SQL : `colonne IN ${sqlInList}` avec
 * `sqlListParam(valeurs)`. Contrairement à `IN (?, ?, ...)`, le texte de la requête ne dépend pas
 * de la longueur de la liste : une seule requête préparée est gardée en cache (voir `db-adapter`).
 */
export const sqlInList = "(SELECT value FROM json_each(?))";

export function sqlListParam(values: readonly (string | number)[]) {
  return JSON.stringify(values);
}
