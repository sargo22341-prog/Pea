import type { CashLedgerEntry } from "@pea/shared";
import { Coins } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DividendVerificationBadge } from "../../../../components/common/cash/verification/DividendVerificationBadge";
import { usePrivacy } from "../../../../contexts/privacy-context";
import { cashMoney } from "../../../../lib/cash/cash-format";
import { formatChartDateTime } from "../../../../lib/format";
import { masquerValeur } from "../../../../lib/privacy";

/** Dividende encaissé de la position, en lecture seule : sa fenêtre permet de le corriger ou le vérifier. */
export function DividendRow({ entry, onOpen }: { entry: CashLedgerEntry; onOpen: () => void }) {
  const { t } = useTranslation(["portfolio", "cash"]);
  const prive = usePrivacy();
  return (
    <div className="flex flex-col gap-2 rounded-md border border-mint/30 bg-mint/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Coins aria-hidden className="text-mint" size={16} />
        <span className="font-medium">{t("portfolio:position.filters.dividendLine")}</span>
        <span className="muted">{formatChartDateTime(entry.effectiveAt)}</span>
        <DividendVerificationBadge verification={entry.verification} />
      </div>
      <div className="flex items-center gap-3">
        <span className="font-semibold text-mint">{masquerValeur(cashMoney(entry.amount), prive)}</span>
        <button className="btn-ghost px-3 py-1 text-xs" onClick={onOpen} type="button">{t("cash:verification.open")}</button>
      </div>
    </div>
  );
}
