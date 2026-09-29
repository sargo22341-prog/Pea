import type { CalendarEventType } from "@pea/shared";
import { eventFamily, type CalendarEventFamily } from "../calendar-grid";

/** Couleur par famille : résultats en cyan, détachement en ambre, versement en vert. */
export const FAMILY_STYLES: Record<CalendarEventFamily, { dot: string; text: string; chip: string }> = {
  earnings: { dot: "bg-cyan-300", text: "text-cyan-300", chip: "border-cyan-300/40 bg-cyan-300/10 text-cyan-200" },
  ex_dividend: { dot: "bg-amber", text: "text-amber", chip: "border-amber/40 bg-amber/10 text-amber" },
  dividend: { dot: "bg-mint", text: "text-mint", chip: "border-mint/40 bg-mint/10 text-mint" }
};

/** Libellé d'un type d'évènement, partagé avec la frise du dashboard (`common:calendar.*`). */
export const EVENT_LABEL_KEYS: Record<CalendarEventType, string> = {
  earnings: "common:calendar.earnings",
  earnings_call: "common:calendar.earningsCall",
  ex_dividend: "common:calendar.exDividend",
  dividend: "common:calendar.dividend"
};

export function eventStyle(type: CalendarEventType) {
  return FAMILY_STYLES[eventFamily(type)];
}
