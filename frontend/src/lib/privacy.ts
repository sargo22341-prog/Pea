/**
 * Rôle du fichier : utilitaires de masquage des valeurs financières
 * personnelles quand le mode privé est activé.
 */

/** Valeur affichée à la place d'un chiffre quand le mode privé est actif. */
const VALEUR_MASQUEE = "••••";

/**
 * Retourne la valeur formatée ou le masque selon l'état du mode privé.
 *
 * @param valeurFormatee - Chiffre déjà formaté (ex: "1 234,56 €").
 * @param prive - Vrai si le mode privé est actif.
 */
export function masquerValeur(valeurFormatee: string, prive: boolean): string {
  return prive ? VALEUR_MASQUEE : valeurFormatee;
}
