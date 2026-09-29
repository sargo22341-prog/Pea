import { CALENDAR_SCOPES, type CalendarScope } from "@pea/shared";
import { useState } from "react";
import { readLocalPreference, writeLocalPreference } from "../../../lib/local-preference";
import { CALENDAR_EVENT_FAMILIES, type CalendarEventFamily } from "../calendar-grid";

export const CALENDAR_VIEWS = ["month", "list"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

const VIEW_KEY = "calendar.view";
const SCOPE_KEY = "calendar.scope";
const FAMILIES_KEY = "calendar.families";

function readChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const stored = readLocalPreference(key);
  return allowed.find((value) => value === stored) ?? fallback;
}

function readFamilies(): ReadonlySet<CalendarEventFamily> {
  const stored = readLocalPreference(FAMILIES_KEY);
  if (stored === null) return new Set(CALENDAR_EVENT_FAMILIES);
  return new Set(CALENDAR_EVENT_FAMILIES.filter((family) => stored.split(",").includes(family)));
}

/** Vue, périmètre et types affichés, mémorisés dans le navigateur (confort, jamais indispensable). */
export function useCalendarPreferences() {
  const [view, setView] = useState<CalendarView>(() => readChoice(VIEW_KEY, CALENDAR_VIEWS, "month"));
  const [scope, setScope] = useState<CalendarScope>(() => readChoice(SCOPE_KEY, CALENDAR_SCOPES, "portfolio"));
  const [families, setFamilies] = useState(readFamilies);

  return {
    view,
    scope,
    families,
    changeView: (next: CalendarView) => {
      setView(next);
      writeLocalPreference(VIEW_KEY, next);
    },
    changeScope: (next: CalendarScope) => {
      setScope(next);
      writeLocalPreference(SCOPE_KEY, next);
    },
    toggleFamily: (family: CalendarEventFamily) => {
      const next = new Set(families);
      if (next.has(family)) next.delete(family);
      else next.add(family);
      setFamilies(next);
      writeLocalPreference(FAMILIES_KEY, [...next].join(","));
    }
  };
}
