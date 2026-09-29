import type { CalendarEvent } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { MOTION } from "../../../components/common/motion";
import { monthGridDays } from "../calendar-grid";
import { eventStyle } from "./event-style";

/** Pastilles visibles par jour ; au-delà, un compteur « +n ». */
const MAX_DOTS_PER_DAY = 3;
/** Un lundi de référence pour nommer les jours de la semaine dans la langue de l'interface. */
const REFERENCE_MONDAY = Date.UTC(2024, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

function weekdayLabels(language: string) {
  const format = new Intl.DateTimeFormat(language, { weekday: "short", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, index) => format.format(new Date(REFERENCE_MONDAY + index * DAY_MS)));
}

export function CalendarMonthGrid({
  month,
  eventsByDay,
  selectedDay,
  today,
  onSelectDay
}: {
  month: string;
  eventsByDay: ReadonlyMap<string, CalendarEvent[]>;
  selectedDay: string | null;
  today: string;
  onSelectDay: (day: string) => void;
}) {
  const { t, i18n } = useTranslation(["calendar"]);
  const dayFormat = new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "long", timeZone: "UTC" });

  return (
    // La clé par mois rejoue le fondu à chaque changement de mois.
    <div className={`card p-2 sm:p-3 ${MOTION.fadeIn}`} key={month}>
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {weekdayLabels(i18n.language).map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {monthGridDays(month).map(({ day, inMonth }) => {
          const events = eventsByDay.get(day) ?? [];
          const selected = day === selectedDay;
          const label = t("calendar:grid.dayLabel", { date: dayFormat.format(new Date(`${day}T00:00:00.000Z`)), count: events.length });
          return (
            <button
              aria-label={label}
              aria-pressed={selected}
              className={`flex min-h-[52px] flex-col items-center gap-1 rounded-lg border p-1 text-xs transition sm:min-h-[72px] ${
                selected ? "border-sky/60 bg-sky/10" : "border-transparent hover:border-line hover:bg-panel2/60"
              } ${inMonth ? "text-slate-200" : "text-slate-600"}`}
              key={day}
              onClick={() => { onSelectDay(day); }}
              type="button"
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded-full ${day === today ? "bg-mint font-bold text-ink" : ""}`}>
                {Number(day.slice(8))}
              </span>
              {events.length ? (
                <span className="flex flex-wrap items-center justify-center gap-0.5" aria-hidden>
                  {events.slice(0, MAX_DOTS_PER_DAY).map((event) => (
                    <span className={`h-1.5 w-1.5 rounded-full ${eventStyle(event.eventType).dot}`} key={event.id} />
                  ))}
                  {events.length > MAX_DOTS_PER_DAY ? <span className="text-[10px] text-slate-400">+{events.length - MAX_DOTS_PER_DAY}</span> : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
