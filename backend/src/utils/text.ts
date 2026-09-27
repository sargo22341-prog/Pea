/** Texte d'une valeur primitive (chaine, nombre, booleen) ; objets, tableaux et valeurs absentes donnent "". */
export function primitiveText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return "";
}
