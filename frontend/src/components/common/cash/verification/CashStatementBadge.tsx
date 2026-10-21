import type { CashStatementCheck } from "@pea/shared";
import { CircleAlert, CircleDashed, FileCheck2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatStatementReference } from "../../../../lib/cash/ledger-entry";
import { formatMaybeDate } from "../../../../lib/format";

const styles = {
  verified: "border-mint/40 bg-mint/10 text-mint",
  to_verify: "border-line bg-ink/40 text-slate-400",
  not_found: "border-coral/40 bg-coral/10 text-coral"
} as const;

const icons = { verified: FileCheck2, to_verify: CircleDashed, not_found: CircleAlert } as const;

/**
 * Contrôle d'une opération par les relevés espèces : « Vérifié par relevé espèces » (ligne
 * retrouvée), « À vérifier » (aucun relevé importé pour sa période) ou « Non retrouvé au relevé »
 * (doublon ou erreur probable).
 */
export function CashStatementBadge({ check }: { check?: CashStatementCheck | undefined }) {
  const { t } = useTranslation("cash");
  if (!check) return null;
  const Icon = icons[check.status];
  const title = check.status === "verified"
    ? t("cashStatements.check.verifiedTitle", { date: formatMaybeDate(check.verifiedAt), reference: formatStatementReference(check.reference) })
    : t(`cashStatements.check.${check.status}Title`);
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${styles[check.status]}`} title={title}>
      <Icon aria-hidden size={12} />
      {t(`cashStatements.check.${check.status}`)}
    </span>
  );
}
