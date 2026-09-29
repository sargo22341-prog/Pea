import type { CalendarEvent } from "@pea/shared";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MOTION, staggerDelay } from "../../../components/common/motion";
import { formatCalendarDay } from "../calendar-grid";
import { CalendarEventItem } from "./CalendarEventItem";

export function CalendarDayEvents({ events }: { events: readonly CalendarEvent[] }) {
  return (
    <div className="space-y-2">
      {events.map((event, index) => (
        <div className={MOTION.rise} key={event.id} style={{ animationDelay: staggerDelay(index) }}>
          <CalendarEventItem event={event} />
        </div>
      ))}
    </div>
  );
}

/**
 * Détail du jour choisi : colonne latérale sur grand écran, feuille modale en bas de l'écran sur
 * mobile (fermée par le bouton ou le voile).
 */
export function CalendarDayPanel({ day, events, onClose }: { day: string; events: readonly CalendarEvent[]; onClose: () => void }) {
  const { t, i18n } = useTranslation(["calendar"]);
  const title = formatCalendarDay(day, i18n.language);

  return (
    <>
      <div aria-hidden className={`fixed inset-0 z-40 bg-black/60 lg:hidden ${MOTION.overlay}`} onClick={onClose} />
      <aside
        aria-label={title}
        className={`fixed inset-x-0 bottom-0 z-50 max-h-[75vh] overflow-y-auto rounded-t-2xl border border-line bg-panel p-4 pb-8 lg:static lg:z-auto lg:max-h-none lg:rounded-2xl lg:pb-4 ${MOTION.dialog}`}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold first-letter:uppercase">{title}</h2>
          <button aria-label={t("calendar:panel.close")} className="btn-ghost h-8 w-8 justify-center p-0" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        {events.length ? <CalendarDayEvents events={events} /> : <p className="text-sm text-slate-400">{t("calendar:panel.empty")}</p>}
      </aside>
    </>
  );
}
