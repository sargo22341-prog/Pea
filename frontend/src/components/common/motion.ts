/**
 * Vocabulaire de mouvement partage par l'interface.
 *
 * Les animations elles-memes vivent dans `src/styles/motion.css` : ce module expose seulement
 * les noms de classes et le calcul des delais, afin qu'un composant n'ait jamais a inventer
 * sa propre duree ou son propre easing.
 */
export const MOTION = {
  /** Apparition simple d'un element secondaire (badge, message). */
  fadeIn: "motion-fade-in",
  /** Entree d'un bloc de contenu : legere montee + fondu. */
  rise: "motion-rise",
  /** Voile sombre d'une fenetre modale. */
  overlay: "motion-overlay",
  /** Panneau d'une fenetre modale. */
  dialog: "motion-dialog",
  /** Menu deroulant ancre sous son declencheur. */
  menu: "motion-menu"
} as const;

/** Decalage entre deux elements consecutifs d'une liste animee. */
const STAGGER_STEP_MS = 35;

/**
 * Nombre d'elements decales au maximum : au-dela, l'attente devient plus genante
 * que l'animation n'est agreable, et les lignes hors ecran n'ont rien a echelonner.
 */
const MAX_STAGGERED_ITEMS = 8;

/**
 * Delai d'animation d'une ligne de liste, a poser dans `style={{ animationDelay }}`.
 * Retourne `undefined` pour la premiere ligne afin d'eviter un style inline inutile.
 */
export function staggerDelay(index: number): string | undefined {
  if (!Number.isFinite(index)) return undefined;
  const position = Math.min(Math.floor(index), MAX_STAGGERED_ITEMS);
  if (position <= 0) return undefined;
  return `${position * STAGGER_STEP_MS}ms`;
}
