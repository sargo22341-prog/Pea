/** Ancetre le plus proche correspondant a la balise, en echouant explicitement s'il n'existe pas. */
export function closestElement<K extends keyof HTMLElementTagNameMap>(element: Element, tagName: K): HTMLElementTagNameMap[K] {
  const found = element.closest(tagName);
  if (!found) throw new Error(`Expected a <${tagName}> ancestor`);
  return found;
}
