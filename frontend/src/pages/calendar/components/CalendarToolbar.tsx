import { CALENDAR_SCOPES, type CalendarScope } from "@pea/shared";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SegmentedTabs } from "../../../components/common/disclosure/SegmentedTabs";
import { CALENDAR_EVENT_FAMILIES, type CalendarEventFamily } from "../calendar-grid";
import { CALENDAR_VIEWS, type CalendarView } from "../hooks/useCalendarPreferences";
import { FAMILY_STYLES } from "./event-style";

export function CalendarToolbar({
  month,
  view,
  scope,
  exporting,
  onMonthChange,
  onToday,
  onViewChange,
  onScopeChange,
  onExport
}: {
  month: string;
  view: CalendarView;
  scope: CalendarScope;
  exporting: boolean;
  onMonthChange: (delta: number) => void;
  onToday: () => void;
  onViewChange: (view: CalendarView) => void;
  onScopeChange: (scope: CalendarScope) => void;
  onExport: () => void;
}) {
  const { t, i18n } = useTranslation(["calendar"]);
  const monthLabel = new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00.000Z`));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        <button aria-label={t("calendar:toolbar.previous")} className="btn-ghost h-9 w-9 justify-center p-0" onClick={() => { onMonthChange(-1); }} type="button">
          <ChevronLeft size={18} />
        </button>
        <h2 aria-live="polite" className="min-w-[150px] text-center text-lg font-semibold first-letter:uppercase">{monthLabel}</h2>
        <button aria-label={t("calendar:toolbar.next")} className="btn-ghost h-9 w-9 justify-center p-0" onClick={() => { onMonthChange(1); }} type="button">
          <ChevronRight size={18} />
        </button>
        <button className="btn-ghost h-9 px-3 text-xs" onClick={onToday} type="button">{t("calendar:toolbar.today")}</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedTabs
          ariaLabel={t("calendar:toolbar.view")}
          onChange={onViewChange}
          options={CALENDAR_VIEWS.map((value) => ({ value, label: t(`calendar:views.${value}`) }))}
          value={view}
        />
        <SegmentedTabs
          ariaLabel={t("calendar:toolbar.scope")}
          onChange={onScopeChange}
          options={CALENDAR_SCOPES.map((value) => ({ value, label: t(`calendar:scopes.${value}`) }))}
          value={scope}
        />
        <button className="btn-ghost h-9 px-3 text-xs" disabled={exporting} onClick={onExport} type="button">
          <Download size={15} />
          {t("calendar:toolbar.export")}
        </button>
      </div>
    </div>
  );
}

/** Puces de filtre par type : chacune masque ou affiche sa famille d'évènements. */
export function CalendarTypeFilters({ families, onToggle }: { families: ReadonlySet<CalendarEventFamily>; onToggle: (family: CalendarEventFamily) => void }) {
  const { t } = useTranslation(["calendar"]);
  return (
    <div aria-label={t("calendar:filters.label")} className="flex flex-wrap gap-2" role="group">
      {CALENDAR_EVENT_FAMILIES.map((family) => {
        const active = families.has(family);
        return (
          <button
            aria-pressed={active}
            className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${active ? FAMILY_STYLES[family].chip : "border-line text-slate-500 hover:text-slate-300"}`}
            key={family}
            onClick={() => { onToggle(family); }}
            type="button"
          >
            <span aria-hidden className={`h-2 w-2 rounded-full ${active ? FAMILY_STYLES[family].dot : "bg-slate-600"}`} />
            {t(`calendar:filters.${family}`)}
          </button>
        );
      })}
    </div>
  );
}
