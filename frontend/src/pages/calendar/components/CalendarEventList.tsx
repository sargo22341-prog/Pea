import type { CalendarEvent } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { MOTION } from "../../../components/common/motion";
import { formatCalendarDay } from "../calendar-grid";
import { CalendarDayEvents } from "./CalendarDayPanel";

/** Vue Liste : les jours du mois qui ont au moins un évènement, dans l'ordre. */
export function CalendarEventList({ month, eventsByDay, today }: { month: string; eventsByDay: ReadonlyMap<string, CalendarEvent[]>; today: string }) {
  const { t, i18n } = useTranslation(["calendar"]);
  const days = [...eventsByDay.keys()].filter((day) => day.startsWith(month)).sort();

  if (!days.length) return <div className="card p-6 text-sm text-slate-400">{t("calendar:empty")}</div>;

  return (
    <div className={`space-y-5 ${MOTION.fadeIn}`} key={month}>
      {days.map((day) => (
        <section className="space-y-2" key={day}>
          <h2 className={`text-xs font-semibold uppercase tracking-wide first-letter:uppercase ${day === today ? "text-mint" : "text-slate-300"}`}>
            {formatCalendarDay(day, i18n.language)}
          </h2>
          <CalendarDayEvents events={eventsByDay.get(day) ?? []} />
        </section>
      ))}
    </div>
  );
}
