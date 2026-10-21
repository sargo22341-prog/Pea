import type { CashStatementLineKind, CashStatementTarget } from "@pea/shared";
import { withinWriteWindow } from "./match-windows.js";

/**
 * Rapprochement d'une ligne de relevé espèces avec les éléments de l'application (règles pures).
 * Critères objectifs uniquement : nature (donc sens), montant signé au centime, quantité pour un
 * achat ou une vente, date dans la fenêtre d'écriture. Le nom abrégé n'est jamais un critère.
 */

/** Élément rapprochable : transaction, mouvement espèces ou ligne de relevé de coupons. */
export interface MatchElement {
  /** `transaction:<id>`, `movement:<id>` ou `statement-line:<id>`. */
  id: string;
  kind: CashStatementTarget["kind"];
  /** Jour de l'élément à Paris, `AAAA-MM-JJ`. */
  day: string;
  effectiveAt: string;
  /** Effet signé sur les espèces, en centimes. */
  cashCents: number;
  quantity?: number | undefined;
  symbol?: string | undefined;
}

export interface MatchLine {
  key: string;
  kind: CashStatementLineKind;
  amountCents: number;
  operationDate: string;
  quantity?: number | undefined;
}

/** Écart de quantité toléré (quantités fractionnaires stockées en flottant). */
const QUANTITY_TOLERANCE = 1e-6;

function sameQuantity(line: MatchLine, element: MatchElement) {
  if (line.kind !== "buy" && line.kind !== "sell") return true;
  if (line.quantity === undefined || element.quantity === undefined) return true;
  return Math.abs(line.quantity - element.quantity) < QUANTITY_TOLERANCE;
}

/** Éléments compatibles avec la ligne, du plus ancien au plus récent. */
export function lineCandidates(line: MatchLine, elements: readonly MatchElement[]) {
  return elements
    .filter((element) => element.kind === line.kind
      && element.cashCents === line.amountCents
      && sameQuantity(line, element)
      && withinWriteWindow(line.kind, element.day, line.operationDate))
    .sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt) || a.id.localeCompare(b.id));
}

export interface Assignment {
  /** Élément attribué sans ambiguïté. */
  target?: string | undefined;
  /** Candidats restants d'une ligne non attribuée (plusieurs : ambiguïté à trancher). */
  candidates: string[];
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

/**
 * Attribue au plus un élément par ligne et une ligne par élément, sur tout un lot :
 * 1. une ligne qui n'a plus qu'un candidat le prend, et il sort des candidats des autres lignes ;
 * 2. n lignes qui ont exactement les mêmes n candidats sont interchangeables (mêmes nature,
 *    montant, quantité et fenêtre) : elles sont appariées dans l'ordre chronologique.
 * Les autres lignes à plusieurs candidats restent ambiguës : l'utilisateur choisit. `chronology`
 * donne le rang chronologique de chaque élément ; les lignes sont dans l'ordre du relevé.
 */
export function assignTargets(lines: readonly { key: string; candidates: readonly string[] }[], chronology: ReadonlyMap<string, number>) {
  const remaining = new Map(lines.map((line) => [line.key, new Set(line.candidates)]));
  const assigned = new Map<string, string>();
  const claim = (key: string, id: string) => {
    assigned.set(key, id);
    for (const [other, set] of remaining) if (other !== key) set.delete(id);
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, set] of remaining) {
      const [only] = [...set];
      if (assigned.has(key) || set.size !== 1 || only === undefined) continue;
      claim(key, only);
      changed = true;
    }
    if (changed) continue;
    const open = [...remaining].filter(([key, set]) => !assigned.has(key) && set.size > 1);
    for (const [key, set] of open) {
      const group = open.filter(([, other]) => sameSet(set, other)).map(([groupKey]) => groupKey);
      if (group.length !== set.size || group[0] !== key) continue;
      const ids = [...set].sort((a, b) => (chronology.get(a) ?? 0) - (chronology.get(b) ?? 0));
      group.forEach((groupKey, index) => { const id = ids[index]; if (id !== undefined) claim(groupKey, id); });
      changed = true;
      break;
    }
  }
  return new Map(lines.map((line): [string, Assignment] => {
    const target = assigned.get(line.key);
    return [line.key, target ? { target, candidates: [target] } : { candidates: [...(remaining.get(line.key) ?? [])] }];
  }));
}
