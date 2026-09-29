import type { AlertEvent } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { describeEvent } from "../../../components/common/alerts/alert-labels";
import { formatArticleDate } from "../../../lib/format";

/** Déclenchements, du plus récent au plus ancien ; les non lus sont signalés par un point. */
export function AlertHistory({ events, unread, onMarkAllRead }: { events: readonly AlertEvent[]; unread: number; onMarkAllRead: () => void }) {
  const { t } = useTranslation(["alerts", "asset"]);
  if (!events.length) return <div className="card p-6 text-center text-sm text-slate-400">{t("history.empty")}</div>;

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line p-4">
        <p className="text-sm text-slate-300">{t("history.unread", { count: unread })}</p>
        {unread > 0 && <button className="btn-ghost h-8 px-3 text-xs" onClick={onMarkAllRead} type="button">{t("markAllRead")}</button>}
      </div>
      <ul className="divide-y divide-line">
        {events.map((event) => (
          <li className="flex items-start gap-3 p-4" key={event.id}>
            <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${event.read ? "bg-transparent" : "bg-coral"}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link className="font-semibold hover:text-sky" to={`/assets/${encodeURIComponent(event.symbol)}`}>{event.assetName}</Link>
                <span className="text-xs text-slate-500">{formatArticleDate(event.triggeredAt)}</span>
              </div>
              <p className="text-sm text-slate-300">{describeEvent(event, t)}</p>
              {!event.read && <span className="sr-only">{t("history.unreadItem")}</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
