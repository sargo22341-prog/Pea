import type { CashStatementLineKind } from "@pea/shared";
import { withoutAccents } from "./cash-statement-text.js";

/**
 * Libellés reconnus en début de ligne (jamais au milieu : « VEOLIA ENVIRON. » contient « VIR »).
 * Chaque règle donne la nature d'un crédit et / ou d'un débit : une seule possibilité fixe le
 * sens, deux possibilités laissent le bouclage du solde trancher. Un libellé inconnu refuse le
 * relevé. Le reste du libellé n'est conservé que pour les valeurs (quantité, nom, échéance) : un
 * virement peut contenir un nom de personne, une reprise de solde un numéro de compte.
 */

/** Ce qui suit le libellé : rien d'utile, une valeur (quantité et nom) ou un coupon (échéance, quantité, nom). */
export type LabelDetail = "none" | "security" | "coupon";

interface LabelRule {
  pattern: RegExp;
  /** Libellé normalisé conservé, sans nom de personne ni référence. */
  label: string;
  credit?: CashStatementLineKind;
  debit?: CashStatementLineKind;
  detail: LabelDetail;
}

const rules: readonly LabelRule[] = [
  { pattern: /^VIR VIREMENT CREATION COMPTE\b/, label: "VIR VIREMENT CREATION COMPTE", credit: "deposit", detail: "none" },
  { pattern: /^VIR VIREMENT INTERNE DEPUIS\b/, label: "VIR Virement interne depuis", credit: "deposit", detail: "none" },
  { pattern: /^VIR VIREMENT DEPUIS\b/, label: "VIR Virement depuis", credit: "deposit", detail: "none" },
  { pattern: /^VIR VIREMENT DE\b/, label: "VIR Virement de", credit: "deposit", detail: "none" },
  // Un autre virement peut entrer ou sortir : seul le bouclage du solde donne son sens.
  { pattern: /^VIR\b/, label: "VIR", credit: "deposit", debit: "withdrawal", detail: "none" },
  { pattern: /^RETRAIT\b/, label: "RETRAIT", debit: "withdrawal", detail: "none" },
  { pattern: /^ACHAT COMPTANT\b/, label: "ACHAT COMPTANT", debit: "buy", detail: "security" },
  { pattern: /^ACHAT ETRANGER\b/, label: "ACHAT ETRANGER", debit: "buy", detail: "security" },
  { pattern: /^ACHAT\b/, label: "ACHAT", debit: "buy", detail: "security" },
  { pattern: /^VENTE COMPTANT\b/, label: "VENTE COMPTANT", credit: "sell", detail: "security" },
  { pattern: /^VENTE ETRANGER\b/, label: "VENTE ETRANGER", credit: "sell", detail: "security" },
  { pattern: /^VENTE\b/, label: "VENTE", credit: "sell", detail: "security" },
  { pattern: /^COUPONS ECHEANCE\b/, label: "COUPONS ECHEANCE", credit: "dividend", detail: "coupon" },
  { pattern: /^REMBOURSEMENT TITRES\b/, label: "REMBOURSEMENT TITRES", credit: "capital_repayment", detail: "security" },
  { pattern: /^LIQUID\. INDEMNISATION\b/, label: "LIQUID. INDEMNISATION", credit: "compensation", detail: "security" },
  { pattern: /^INDEMNISATION\b/, label: "INDEMNISATION", credit: "compensation", detail: "security" },
  // Changement de numéro de compte : transfert neutre, dans un sens ou dans l'autre.
  { pattern: /^REPRISE SOLDE COMPTE\b/, label: "Reprise solde compte", credit: "balance_transfer", debit: "balance_transfer", detail: "none" },
  { pattern: /^(?:FRAIS|COMMISSION|COTISATION|DROITS DE GARDE)\b/, label: "FRAIS", debit: "fee", detail: "none" },
  { pattern: /^(?:TAXE|TTF)\b/, label: "TAXE", debit: "fee", detail: "none" }
];

export interface RecognizedLabel {
  label: string;
  credit?: CashStatementLineKind | undefined;
  debit?: CashStatementLineKind | undefined;
  detail: LabelDetail;
  /** Suite du libellé, utile seulement pour une valeur ou un coupon (vide sinon). */
  rest: string;
}

export function recognizeLabel(text: string): RecognizedLabel | undefined {
  const normalized = withoutAccents(text).toUpperCase();
  const rule = rules.find((candidate) => candidate.pattern.test(normalized));
  if (!rule) return undefined;
  const matched = rule.pattern.exec(normalized)?.[0] ?? "";
  return {
    label: rule.label,
    credit: rule.credit,
    debit: rule.debit,
    detail: rule.detail,
    rest: rule.detail === "none" ? "" : text.slice(matched.length).trim()
  };
}
