import type { DividendYearAmount } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { money } from "../../../lib/format";
import { MOTION, staggerDelay } from "../motion";

/** Hauteur minimale d'une barre non nulle, pour qu'un petit dividende reste visible. */
const MIN_BAR_PERCENT = 6;

/**
 * Dividende annuel par action des années complètes, en barres verticales. Une année sans
 * versement apparaît vide : c'est précisément l'information recherchée.
 */
export function DividendHistoryBars({ history, currency }: { history: readonly DividendYearAmount[]; currency: string }) {
  const { t } = useTranslation("common");
  const max = Math.max(...history.map((entry) => entry.amountPerShare), 0);
  if (!history.length || max <= 0) return null;

  return (
    <ol aria-label={t("dividends.historyLabel")} className="flex h-28 items-end gap-1.5">
      {history.map((entry, index) => {
        const label = t("dividends.historyEntry", { year: entry.year, value: money(entry.amountPerShare, currency) });
        const height = entry.amountPerShare > 0 ? Math.max(MIN_BAR_PERCENT, (entry.amountPerShare / max) * 100) : 0;
        return (
          <li aria-label={label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" key={entry.year} title={label}>
            <span className="flex w-full max-w-8 flex-1 items-end">
              <span className={`block w-full rounded-t-sm bg-mint/80 ${MOTION.rise}`} style={{ height: `${height}%`, animationDelay: staggerDelay(index) }} />
            </span>
            <span className="text-[10px] leading-none text-slate-500">{String(entry.year).slice(2)}</span>
          </li>
        );
      })}
    </ol>
  );
}
