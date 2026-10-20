import type { DividendVerificationInfo } from "@pea/shared";
import { BadgeCheck, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatStatementReference } from "../../../../lib/cash/ledger-entry";
import { formatMaybeDate } from "../../../../lib/format";

/** Badge d'un dividende vérifié : « Certifié par relevé » prime sur « Vérifié manuellement ». */
export function DividendVerificationBadge({ verification }: { verification?: DividendVerificationInfo | undefined }) {
  const { t } = useTranslation("cash");
  if (!verification) return null;
  const certified = verification.status === "document";
  const date = formatMaybeDate(verification.verifiedAt);
  let title = t("verification.manualTitle", { date });
  if (certified) title = verification.reference ? t("verification.certifiedTitle", { date, reference: formatStatementReference(verification.reference) }) : `${t("verification.certified")} · ${date}`;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${certified ? "border-mint/40 bg-mint/10 text-mint" : "border-sky/40 bg-sky/10 text-sky"}`} title={title}>
      {certified ? <BadgeCheck aria-hidden size={12} /> : <Check aria-hidden size={12} />}
      {t(certified ? "verification.certified" : "verification.manual")}
    </span>
  );
}
