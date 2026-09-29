import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MOTION } from "../../components/common/motion";
import { useAsync } from "../../hooks/useAsync";
import { api } from "../../lib/api";
import { localIsoDate } from "../../lib/timezone";
import { currentMonth, eventFamily, groupEventsByDay, monthRange, shiftMonth } from "./calendar-grid";
import { CalendarDayPanel } from "./components/CalendarDayPanel";
import { CalendarEventList } from "./components/CalendarEventList";
import { CalendarMonthGrid } from "./components/CalendarMonthGrid";
import { CalendarToolbar, CalendarTypeFilters } from "./components/CalendarToolbar";
import { useCalendarExport } from "./hooks/useCalendarExport";
import { useCalendarPreferences } from "./hooks/useCalendarPreferences";

function CalendarSkeleton() {
  return (
    <div className="card grid grid-cols-7 gap-1 p-3">
      {Array.from({ length: 35 }, (_, index) => <div className="h-[52px] animate-pulse rounded-lg bg-panel2 sm:h-[72px]" key={index} />)}
    </div>
  );
}

/** Calendrier des résultats, détachements et versements des actifs de l'utilisateur. */
export function CalendarPage({ appTimezone }: { appTimezone: string }) {
  const { t } = useTranslation(["calendar", "navigation"]);
  const preferences = useCalendarPreferences();
  const today = localIsoDate(new Date(), appTimezone);
  const [month, setMonth] = useState(() => currentMonth(appTimezone));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const range = useMemo(() => ({ scope: preferences.scope, ...monthRange(month) }), [preferences.scope, month]);
  const events = useAsync((signal) => api.calendarRange(range, signal), `${range.scope}:${range.from}:${range.to}`);
  const calendarExport = useCalendarExport();

  useEffect(() => {
    document.title = `${t("navigation:calendar")} | PEA Portfolio`;
    return () => { document.title = "PEA Portfolio"; };
  }, [t]);

  useEffect(() => {
    if (!selectedDay) return undefined;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedDay(null); };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); };
  }, [selectedDay]);

  const eventsByDay = useMemo(() => {
    const visible = (events.data ?? []).filter((event) => preferences.families.has(eventFamily(event.eventType)));
    return groupEventsByDay(visible, appTimezone);
  }, [events.data, preferences.families, appTimezone]);

  function changeMonth(next: string) {
    setMonth(next);
    setSelectedDay(null);
  }

  const showPanel = preferences.view === "month" && selectedDay !== null;
  const monthIsEmpty = ![...eventsByDay.keys()].some((day) => day.startsWith(month));

  return (
    <div className={`space-y-4 ${MOTION.stagger}`}>
      <div>
        <h1 className="text-2xl font-bold">{t("navigation:calendar")}</h1>
        <p className="muted">{t("calendar:subtitle")}</p>
      </div>

      <CalendarToolbar
        exporting={calendarExport.exporting}
        month={month}
        onExport={() => { void calendarExport.exportRange({ scope: preferences.scope, ...monthRange(month) }); }}
        onMonthChange={(delta) => { changeMonth(shiftMonth(month, delta)); }}
        onScopeChange={preferences.changeScope}
        onToday={() => { changeMonth(currentMonth(appTimezone)); setSelectedDay(today); }}
        onViewChange={preferences.changeView}
        scope={preferences.scope}
        view={preferences.view}
      />
      <CalendarTypeFilters families={preferences.families} onToggle={preferences.toggleFamily} />

      {calendarExport.error ? <div className="card border-coral p-3 text-sm text-coral">{calendarExport.error}</div> : null}
      {events.error ? <div className="card border-coral p-4 text-sm text-coral">{events.error}</div> : null}

      {events.loading ? (
        <CalendarSkeleton />
      ) : preferences.view === "list" ? (
        <CalendarEventList eventsByDay={eventsByDay} month={month} today={today} />
      ) : (
        <div className={`grid gap-4 ${showPanel ? "lg:grid-cols-[minmax(0,1fr)_340px]" : ""}`}>
          <CalendarMonthGrid eventsByDay={eventsByDay} month={month} onSelectDay={setSelectedDay} selectedDay={selectedDay} today={today} />
          {monthIsEmpty && !showPanel ? <p className="text-sm text-slate-400 lg:col-span-2">{t("calendar:empty")}</p> : null}
          {showPanel ? <CalendarDayPanel day={selectedDay} events={eventsByDay.get(selectedDay) ?? []} onClose={() => { setSelectedDay(null); }} /> : null}
        </div>
      )}
    </div>
  );
}
