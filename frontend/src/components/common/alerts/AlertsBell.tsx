import { Bell } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { AlertEventsState } from "../../../hooks/useAlertEvents";
import { useDismiss } from "../../../hooks/useDismiss";
import { formatArticleDate } from "../../../lib/format";
import { MOTION } from "../motion";
import { describeEvent } from "./alert-labels";

/** Compteur affiché au-delà duquel la pastille indique « 9+ ». */
const MAX_BADGE_COUNT = 9;

/**
 * Cloche de l'en-tête : pastille des alertes non lues et menu des derniers déclenchements. Les
 * données viennent de l'en-tête, qui affiche une cloche par mise en page (mobile, bureau) sans
 * dupliquer les requêtes.
 */
export function AlertsBell({ alerts }: { alerts: AlertEventsState }) {
  const { t } = useTranslation(["alerts", "asset"]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => { setOpen(false); }, []);
  useDismiss(open, rootRef, close);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={alerts.unread ? t("bell.labelUnread", { count: alerts.unread }) : t("bell.label")}
        className="btn-ghost relative px-2"
        onClick={() => { setOpen((current) => !current); }}
        type="button"
      >
        <Bell size={18} />
        {alerts.unread > 0 && (
          <span className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral px-1 text-[10px] font-bold text-white ${MOTION.pop}`} key={alerts.unread}>
            {alerts.unread > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : alerts.unread}
          </span>
        )}
      </button>
      {open && (
        <div className={`absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-line bg-panel shadow-glow ${MOTION.menu}`} role="menu">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-sm font-semibold">{t("bell.title")}</span>
            {alerts.unread > 0 && (
              <button className="text-xs font-semibold text-sky hover:text-sky/80" onClick={() => void alerts.markAllRead()} type="button">{t("markAllRead")}</button>
            )}
          </div>
          {alerts.events.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-400">{t("bell.empty")}</p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {alerts.events.map((event) => (
                <li key={event.id}>
                  <Link className="block px-3 py-2 text-sm transition hover:bg-panel2" onClick={close} role="menuitem" to={`/assets/${encodeURIComponent(event.symbol)}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate font-semibold ${event.read ? "text-slate-300" : "text-slate-100"}`}>{event.assetName}</span>
                      <span className="shrink-0 text-xs text-slate-500">{formatArticleDate(event.triggeredAt)}</span>
                    </span>
                    <span className="block text-xs text-slate-400">{describeEvent(event, t)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {alerts.error && <p className="px-3 py-2 text-xs text-coral">{alerts.error}</p>}
          <Link className="block border-t border-line px-3 py-2 text-center text-xs font-semibold text-sky hover:bg-panel2" onClick={close} role="menuitem" to="/alerts">{t("bell.seeAll")}</Link>
        </div>
      )}
    </div>
  );
}
