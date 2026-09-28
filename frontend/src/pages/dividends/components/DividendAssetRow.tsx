import type { CurrencyCode, DividendGrowthSummary } from "@pea/shared";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AssetIcon } from "../../../components/common/AssetIcon";
import { AristocratBadge } from "../../../components/common/dividends/AristocratBadge";
import { DividendHistoryBars } from "../../../components/common/dividends/DividendHistoryBars";
import { PayoutGauge } from "../../../components/common/dividends/PayoutGauge";
import { DetailsToggle } from "../../../components/common/disclosure/DetailsToggle";
import { MOTION, staggerDelay } from "../../../components/common/motion";
import { money } from "../../../lib/format";
import { formatFractionPercent } from "../../../lib/format-metrics";
import { masquerValeur } from "../../../lib/privacy";

export interface DividendGroup {
  symbol: string;
  name: string;
  quantity: number;
  currency: CurrencyCode;
  quarters: [number, number, number, number];
  total: number;
  dividendPercent?: number | undefined;
  yieldOnCostPercent?: number | undefined;
  payoutRatio?: number | undefined;
  growth?: DividendGrowthSummary | undefined;
  hasAnnounced: boolean;
  hasEstimated: boolean;
  hasProjected: boolean;
  stale?: boolean | undefined;
}

export function DividendAssetRow({ group, index, prive }: { group: DividendGroup; index: number; prive: boolean }) {
  const { t } = useTranslation(["dashboard"]);
  const sourceLabel = group.hasProjected
    ? t("dividendsPage.projected")
    : group.hasAnnounced
      ? t(group.hasEstimated ? "dividendsPage.announcedAndEstimated" : "dividendsPage.announced")
      : group.hasEstimated
        ? t("dividendsPage.estimated")
        : group.stale
          ? t("dividendsPage.cached")
          : undefined;

  return (
    <div className={MOTION.rise} style={{ animationDelay: staggerDelay(index) }}>
      <Link className="grid min-w-0 grid-cols-[minmax(0,1fr)_110px_minmax(80px,auto)] items-center gap-1 p-4 pb-2 transition hover:bg-panel2/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-mint sm:gap-3 sm:grid-cols-[minmax(0,1fr)_150px_minmax(126px,1fr)]" to={`/assets/${group.symbol}`}>
        <div className="flex min-w-[90px] items-center gap-3 justify-self-start sm:min-w-0">
          <AssetIcon className="h-11 w-11 shrink-0" symbol={group.symbol} />
          <div className="min-w-0">
            <p className="max-w-[70px] truncate text-xs font-semibold uppercase sm:max-w-none sm:text-base" title={group.name}>
              {group.name}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {t("dividendsPage.shares", { quantity: masquerValeur(formatQuantity(group.quantity), prive) })}
            </p>
          </div>
        </div>

        <div className="ml-auto mr-[50px] w-[80px] sm:mx-auto sm:mr-0 sm:w-[150px]">
          <QuarterBars currency={group.currency} prive={prive} quarters={group.quarters} />
        </div>

        <div className="min-w-0 justify-self-end text-right">
          <p className="truncate font-semibold text-mint">{masquerValeur(money(group.total, group.currency), prive)}</p>
          <p className="mt-1 truncate text-xs text-slate-400 sm:text-sm">
            {/* dividendPercent = rendement marché, visible. yieldOnCostPercent = rendement sur coût d'achat, personnel. */}
            {formatOptionalPercent(group.dividendPercent)}
            {group.yieldOnCostPercent !== undefined ? ` / ${masquerValeur(formatOptionalPercent(group.yieldOnCostPercent), prive)}` : ""}
          </p>
          {sourceLabel ? <p className="mt-1 text-xs text-slate-500">{sourceLabel}</p> : null}
        </div>
      </Link>
      <DividendGrowthLine currency={group.currency} growth={group.growth} payoutRatio={group.payoutRatio} symbol={group.symbol} />
    </div>
  );
}

/** Croissance, régularité et soutenabilité du dividende, avec l'historique annuel replié. */
function DividendGrowthLine({ growth, payoutRatio, currency, symbol }: { growth?: DividendGrowthSummary | undefined; payoutRatio?: number | undefined; currency: CurrencyCode; symbol: string }) {
  const { t } = useTranslation(["dashboard"]);
  const growthRate = growth?.growthRate;
  const hasHistory = (growth?.history.length ?? 0) > 1;
  if (growthRate === undefined && !growth?.aristocrat && payoutRatio === undefined && !hasHistory) return <div className="pb-2" />;

  return (
    <div className="px-4 pb-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
        {growthRate !== undefined ? (
          <span>
            {t("dividendsPage.growth5y")}{" "}
            <span className={growthRate > 0 ? "font-semibold text-mint" : growthRate < 0 ? "font-semibold text-coral" : "font-semibold text-slate-200"}>
              {t("dividendsPage.perYear", { value: formatFractionPercent(growthRate, { signed: true }) })}
            </span>
          </span>
        ) : null}
        {growth?.aristocrat ? <AristocratBadge streak={growth.increaseStreak} /> : null}
        {payoutRatio !== undefined ? (
          <span className="inline-flex items-center gap-1.5">
            {t("dividendsPage.payout")}
            <PayoutGauge value={payoutRatio} />
          </span>
        ) : null}
      </div>
      {hasHistory && growth ? (
        <DetailsToggle label={t("dividendsPage.annualHistory")} storageKey={`dividends.history.${symbol}`}>
          <DividendHistoryBars currency={currency} history={growth.history} />
        </DetailsToggle>
      ) : null}
    </div>
  );
}

function QuarterBars({ quarters, currency, prive }: { quarters: [number, number, number, number]; currency: CurrencyCode; prive: boolean }) {
  const { t } = useTranslation(["dashboard"]);
  const max = Math.max(...quarters, 0);

  return (
    <div aria-label={t("dividendsPage.quarterlyBreakdown")} className="grid h-14 min-w-0 grid-cols-4 items-end gap-1">
      {quarters.map((amount, index) => {
        const height = max > 0 ? Math.max(8, Math.round((amount / max) * 40)) : 4;
        return (
          <div className="flex min-w-0 flex-col items-center gap-1" key={`q${index + 1}`} title={`Q${index + 1} - ${masquerValeur(money(amount, currency), prive)}`}>
            <div className={`w-full max-w-6 rounded-t-sm ${amount > 0 ? "bg-mint" : "bg-line"}`} style={{ height }} />
            <span className="text-[10px] leading-none text-slate-500">Q{index + 1}</span>
          </div>
        );
      })}
    </div>
  );
}

function safeNumber(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(safeNumber(value));
}

function formatOptionalPercent(value: number | undefined) {
  if (!Number.isFinite(value)) return "n/a";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number(value))} %`;
}
