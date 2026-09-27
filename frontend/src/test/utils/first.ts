/** Premier element d'une liste, en echouant explicitement si elle est vide. */
export function first<T>(items: readonly T[]): T {
  const [item] = items;
  if (item === undefined) throw new Error("Expected at least one item");
  return item;
}
