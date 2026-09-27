/** Garantit qu'une ligne relue juste apres son ecriture existe ; une absence signale une incoherence de donnees. */
export function requirePresent<T>(value: T | null | undefined, description: string): T {
  if (value === null || value === undefined) throw new Error(`${description} introuvable apres ecriture.`);
  return value;
}
