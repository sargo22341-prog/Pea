import type { CurrencyCode } from "@pea/shared";
import { CalendarClock } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePrivacy } from "../../../contexts/PrivacyContext";
import { AssetIcon } from "../../../components/common/AssetIcon";
import { money } from "../../../lib/format";
import { masquerValeur } from "../../../lib/privacy";

export interface DividendGroup {
  symbol: string;
  name: string;
  quantity: number;
  currency: CurrencyCode;
  quarters: [number, number, number, number];
  total: number;
  dividendPercent?: number;
  yieldOnCostPercent?: number;
  hasEstimated: boolean;
  stale?: boolean;
}

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

      <div className="divide-y divide-line">
        {groups.length === 0 && <p className="p-4 text-slate-400">{t("dividendsPage.noDividendAvailable", { ns: "dashboard" })}</p>}
        {groups.map((group) => (
          <DividendAssetRow group={group} key={group.symbol} prive={prive} />
        ))}
      </div>
    </section>
  );
}

function DividendAssetRow({ group, prive }: { group: DividendGroup; prive: boolean }) {
  const { t } = useTranslation(["dashboard"]);
  return (
    <Link className="grid min-w-0 grid-cols-[minmax(0,1fr)_110px_minmax(80px,auto)] items-center gap-1 p-4 transition hover:bg-panel2/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-mint sm:gap-3 sm:grid-cols-[minmax(0,1fr)_150px_minmax(126px,1fr)]" to={`/assets/${group.symbol}`}>
      {/* LEFT */}
      <div className="flex min-w-[90px] sm:min-w-0 items-center gap-3 justify-self-start">
        <AssetIcon className="h-11 w-11 shrink-0" symbol={group.symbol} />

        <div className="min-w-0">
          <p
            title={group.name}
            className="truncate max-w-[70px] text-xs sm:text-sm font-semibold uppercase sm:max-w-none sm:text-base"
          >
            {group.name}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {t("dividendsPage.shares", { ns: "dashboard", quantity: masquerValeur(`${formatQuantity(group.quantity)}`, prive) })}
          </p>
        </div>
      </div>

      {/* CENTER */}
      <div className="ml-auto mr-[50px] w-[80px] sm:mx-auto sm:mr-0 sm:w-[150px]">
        <QuarterBars quarters={group.quarters} currency={group.currency} prive={prive} />
      </div>

      {/* RIGHT */}
      <div className="min-w-0 justify-self-end text-right">
        <p className="truncate font-semibold text-mint">
          {masquerValeur(money(group.total, group.currency), prive)}
        </p>
        <p className="mt-1 truncate text-xs text-slate-400 sm:text-sm">
          {/* dividendPercent = rendement marché, visible. yieldOnCostPercent = rendement sur coût d'achat, personnel. */}
          {formatOptionalPercent(group.dividendPercent)}
          {group.yieldOnCostPercent !== undefined
            ? ` / ${masquerValeur(formatOptionalPercent(group.yieldOnCostPercent), prive)}`
            : ""}
        </p>

        {(group.hasEstimated || group.stale) && (
          <p className="mt-1 text-xs text-slate-500">
            {group.hasEstimated ? t("dividendsPage.estimated", { ns: "dashboard" }) : t("dividendsPage.cached", { ns: "dashboard" })}
          </p>
        )}
      </div>
    </Link>
  );
}

function QuarterBars({ quarters, currency, prive }: { quarters: [number, number, number, number]; currency: CurrencyCode; prive: boolean }) {
  const { t } = useTranslation(["dashboard"]);
  const max = Math.max(...quarters, 0);

  return (
    <div className="grid h-14 min-w-0 grid-cols-4 items-end gap-1" aria-label={t("dividendsPage.quarterlyBreakdown", { ns: "dashboard" })}>
      {quarters.map((amount, index) => {
        const height = max > 0 ? Math.max(8, Math.round((amount / max) * 40)) : 4;
        return (
          <div className="flex min-w-0 flex-col items-center gap-1" key={`q${index + 1}`} title={`Q${index + 1} - ${masquerValeur(money(amount, currency), prive)}`}>
            <div
              className={`w-full max-w-6 rounded-t-sm ${amount > 0 ? "bg-mint" : "bg-line"}`}
              style={{ height }}
            />
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
