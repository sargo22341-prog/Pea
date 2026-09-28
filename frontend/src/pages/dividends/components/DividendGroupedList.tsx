import type { CurrencyCode } from "@pea/shared";
import { CalendarClock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePrivacy } from "../../../contexts/privacy-context";
import { money } from "../../../lib/format";
import { masquerValeur } from "../../../lib/privacy";
import { DividendAssetRow, type DividendGroup } from "./DividendAssetRow";

interface DividendGroupedListProps {
  currency: CurrencyCode;
  groups: DividendGroup[];
  total: number;
  year: string;
}

export function DividendGroupedList({ currency, groups, total, year }: DividendGroupedListProps) {
  const { t } = useTranslation(["dashboard"]);
  const prive = usePrivacy();

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarClock className="text-mint" size={20} />
            <h2 className="font-semibold">{t("dividendsPage.income", { ns: "dashboard", year })}</h2>
          </div>
          <p className="muted mt-1">{t("dividendsPage.groupedList", { ns: "dashboard" })}</p>
        </div>
        <p className="text-lg font-semibold text-mint">{masquerValeur(money(total, currency), prive)}</p>
      </div>

      {/* La cle par annee rejoue l'apparition en cascade lors d'un changement d'annee. */}
      <div className="divide-y divide-line" key={year}>
        {groups.length === 0 && <p className="p-4 text-slate-400">{t("dividendsPage.noDividendAvailable", { ns: "dashboard" })}</p>}
        {groups.map((group, index) => (
          <DividendAssetRow group={group} index={index} key={group.symbol} prive={prive} />
        ))}
      </div>
    </section>
  );
}
