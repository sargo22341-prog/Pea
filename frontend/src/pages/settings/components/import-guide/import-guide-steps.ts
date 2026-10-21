/**
 * Contenu du guide des imports Boursorama : l'ordre des étapes, et pour chacune ce que fait
 * l'import (ajouter, vérifier, certifier, signaler). Les textes vivent dans
 * `settings.importGuide` ; ce module ne porte que la structure, testable sans rendu.
 */

/**
 * Effet d'un import sur les données, affiché par un badge de couleur fixe :
 * - `preview` : l'aperçu lit les fichiers sans rien écrire ;
 * - `write` : crée ou modifie des opérations après votre validation ;
 * - `verify` : badge « Vérifié par relevé espèces » ;
 * - `certify` : badge « Certifié par relevé » (relevé de coupons) ;
 * - `flag` : signale un document manquant ou une incohérence, sans rien écrire.
 */
export type GuideEffect = "preview" | "write" | "verify" | "certify" | "flag";

export const GUIDE_EFFECTS: readonly GuideEffect[] = ["preview", "write", "verify", "certify", "flag"];

export type GuideStepId = "overview" | "csv" | "avis" | "coupons" | "cash" | "control";

/** Point du guide : son effet et la clé de son texte sous `importGuide.steps.<étape>.points`. */
export interface GuidePoint {
  effect: GuideEffect;
  key: string;
}

export interface GuideStep {
  id: GuideStepId;
  /** Étape qui correspond à un import de la page (numérotée dans l'ordre conseillé). */
  isImport: boolean;
  points: readonly GuidePoint[];
}

export const IMPORT_GUIDE_STEPS: readonly GuideStep[] = [
  { id: "overview", isImport: false, points: [] },
  {
    id: "csv",
    isImport: true,
    points: [
      { effect: "preview", key: "preview" },
      { effect: "write", key: "import" },
      { effect: "write", key: "update" },
      { effect: "flag", key: "missing" }
    ]
  },
  {
    id: "avis",
    isImport: true,
    points: [
      { effect: "preview", key: "preview" },
      { effect: "write", key: "create" },
      { effect: "write", key: "link" },
      { effect: "flag", key: "duplicates" },
      { effect: "flag", key: "funds" }
    ]
  },
  {
    id: "coupons",
    isImport: true,
    points: [
      { effect: "certify", key: "certify" },
      { effect: "write", key: "create" },
      { effect: "flag", key: "correct" },
      { effect: "certify", key: "opening" },
      { effect: "write", key: "refunds" }
    ]
  },
  {
    id: "cash",
    isImport: true,
    points: [
      { effect: "verify", key: "verify" },
      { effect: "write", key: "deposits" },
      { effect: "write", key: "coupons" },
      { effect: "flag", key: "missing" },
      { effect: "flag", key: "continuity" }
    ]
  },
  {
    id: "control",
    isImport: false,
    points: [
      { effect: "verify", key: "monthly" },
      { effect: "flag", key: "gaps" },
      { effect: "write", key: "fullHistory" }
    ]
  }
];

/** État visuel d'une étape dans la barre de progression du guide. */
export type GuideStepStatus = "current" | "seen" | "upcoming";

export function guideStepStatus(index: number, current: number, seen: ReadonlySet<number>): GuideStepStatus {
  if (index === current) return "current";
  return seen.has(index) ? "seen" : "upcoming";
}

/** Effets distincts d'une étape, dans l'ordre de la légende. */
export function stepEffects(step: GuideStep): GuideEffect[] {
  const present = new Set(step.points.map((point) => point.effect));
  return GUIDE_EFFECTS.filter((effect) => present.has(effect));
}
