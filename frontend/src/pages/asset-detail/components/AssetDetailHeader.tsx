import type { PeaEligibilityStatus, Quote } from "@pea/shared";
import { ArrowDownRight, ArrowUpRight, Pencil, Plus, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AssetIcon } from "../../../components/common/AssetIcon";
import { MOTION, flashClass } from "../../../components/common/motion";
import { StaleBadge } from "../../../components/common/StaleBadge";
import { money, percent } from "../../../lib/format";
import { useNumberPulse, useTogglePulse } from "../hooks/useValuePulse";
import { PeaBadge } from "./PeaBadge";

/** Retour visuel au survol et a l'appui sur les actions de l'en-tete. */
const PRESSABLE = "transition duration-150 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.97]";

export function AssetDetailHeader({
  displayPrice,
  marketUnavailable,
  onAdd,
  onEdit,
  onToggleWatchlist,
  peaEligibilityStatus,
  positionExists,
  quote,
  rangeChange,
  rangeChangePercent,
  stale,
  watchlisted
}: {
  displayPrice: number;
  marketUnavailable?: boolean;
  onAdd: () => void;
  onEdit: () => void;
  onToggleWatchlist: () => void;
  peaEligibilityStatus: PeaEligibilityStatus;
  positionExists: boolean;
  quote: Quote;
  rangeChange: number;
  rangeChangePercent: number;
  stale?: boolean;
  watchlisted: boolean;
}) {
  const { t } = useTranslation(["asset", "common"]);
  const positive = rangeChange >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  const pricePulse = useNumberPulse(displayPrice);
  const watchlistPulseKey = useTogglePulse(watchlisted);

  return (
    <section className="card p-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <AssetIcon className="h-14 w-14" symbol={quote.symbol} />
          <div className="min-w-0">
            <p className="muted">{quote.symbol}</p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold">{quote.name}</h1>
              <PeaBadge status={peaEligibilityStatus} />
              <StaleBadge
                label={marketUnavailable ? t("marketUnavailable", { ns: "asset" }) : t("marketDelayed", { ns: "asset" })}
                show={Boolean(stale || quote.stale || marketUnavailable)}
              />
            </div>
            <p className="mt-2 text-slate-400">
              {quote.exchange ?? t("marketNotAvailable", { ns: "asset" })} - {quote.currency}
            </p>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-3xl font-bold">
            <span
              className={`-mx-2 -my-1 inline-block rounded-md px-2 py-1 ${flashClass(pricePulse.trend)}`}
              key={pricePulse.pulseKey}
            >
              {money(displayPrice, quote.currency)}
            </span>
          </p>
          <p className={`mt-1 flex items-center gap-1 font-semibold sm:justify-end ${positive ? "text-mint" : "text-coral"}`}>
            <Icon size={18} />
            {money(rangeChange, quote.currency)} ({percent(rangeChangePercent)})
          </p>
          <div className="mt-3 flex flex-wrap gap-2 sm:justify-end">
            {positionExists ? (
              <button className={`btn-ghost ${PRESSABLE}`} onClick={onEdit} type="button">
                <Pencil size={17} />
                {t("actions.edit", { ns: "common" })}
              </button>
            ) : (
              <>
                <button className={`btn-primary ${PRESSABLE}`} onClick={onAdd} type="button">
                  <Plus size={17} />
                  {t("actions.add", { ns: "common" })}
                </button>
                <button
                  aria-pressed={watchlisted}
                  className={`${watchlisted ? "btn bg-amber text-ink" : "btn-ghost"} ${PRESSABLE}`}
                  onClick={onToggleWatchlist}
                  type="button"
                >
                  <Star
                    className={watchlistPulseKey > 0 ? MOTION.pop : undefined}
                    fill={watchlisted ? "currentColor" : "none"}
                    key={watchlistPulseKey}
                    size={17}
                  />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
