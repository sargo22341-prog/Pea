import type { CalendarEvent } from "@pea/shared";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AssetIcon } from "../../../components/common/AssetIcon";
import { MOTION } from "../../../components/common/motion";
import { usePrivacy } from "../../../contexts/privacy-context";
import { money } from "../../../lib/format";
import { formatCompactMoney } from "../../../lib/format-metrics";
import { masquerValeur } from "../../../lib/privacy";
import { EVENT_LABEL_KEYS, eventStyle } from "./event-style";

function hasEstimates(event: CalendarEvent) {
  return event.eventType === "earnings" && (event.epsAverage !== undefined || event.revenueAverage !== undefined);
}

/** Évènement du calendrier ; le consensus d'une publication se déplie au clic. */
export function CalendarEventItem({ event }: { event: CalendarEvent }) {
  const { t } = useTranslation(["calendar", "common"]);
  const prive = usePrivacy();
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const style = eventStyle(event.eventType);
  const currency = event.currency ?? "EUR";
  const expected = event.expectedDividend;
  const expandable = hasEstimates(event);

  return (
    <article className="rounded-[14px] border border-white/[0.05] bg-slate-950/20 p-3">
      <div className="flex items-start gap-3">
        <AssetIcon className="h-9 w-9 shrink-0" symbol={event.symbol} />
        <div className="min-w-0 flex-1">
          <p className={`flex flex-wrap items-center gap-2 text-sm font-semibold ${style.text}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} aria-hidden />
            {t(EVENT_LABEL_KEYS[event.eventType])}
            {event.isEstimate ? <span className="rounded-full border border-line px-2 text-[10px] font-medium text-slate-400">{t("common:calendar.estimate")}</span> : null}
          </p>
          <Link className="mt-0.5 block truncate text-sm text-slate-200 hover:text-white" to={`/assets/${encodeURIComponent(event.symbol)}`}>
            {event.assetName} <span className="text-xs text-slate-500">{event.symbol}</span>
          </Link>
          {expected ? (
            <p className="mt-1 text-xs text-slate-300">
              {t(`calendar:expected.${expected.status}`, { amount: masquerValeur(money(expected.amount, expected.currency), prive) })}
            </p>
          ) : null}
        </div>
        {expandable ? (
          <button
            aria-controls={detailsId}
            aria-expanded={open}
            aria-label={t("calendar:estimates.toggle")}
            className="btn-ghost h-8 w-8 shrink-0 justify-center p-0"
            onClick={() => { setOpen((current) => !current); }}
            type="button"
          >
            <ChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} size={16} />
          </button>
        ) : null}
      </div>
      {expandable && open ? (
        <dl className={`mt-2 grid grid-cols-2 gap-2 text-xs ${MOTION.rise}`} id={detailsId}>
          {event.epsAverage !== undefined ? (
            <div><dt className="text-slate-500">{t("calendar:estimates.eps")}</dt><dd className="font-semibold text-slate-200">{money(event.epsAverage, currency)}</dd></div>
          ) : null}
          {event.revenueAverage !== undefined ? (
            <div><dt className="text-slate-500">{t("calendar:estimates.revenue")}</dt><dd className="font-semibold text-slate-200">{formatCompactMoney(event.revenueAverage, currency)}</dd></div>
          ) : null}
        </dl>
      ) : null}
    </article>
  );
}
