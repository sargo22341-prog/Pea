import express from "express";
import { z } from "zod";
import { CALENDAR_MAX_RANGE_DAYS, CALENDAR_SCOPES } from "@pea/shared";
import { config } from "../../../config.js";
import { mapEventRow, readCalendarEventsBySymbol, readCalendarEventsForPortfolio } from "../../../repositories/calendar-events/calendar-events.repository.js";
import { buildCalendarIcs } from "../../../services/calendar/calendar-ics.js";
import { calendarEventsInRange } from "../../../services/calendar/calendar.service.js";
import { asyncRoute } from "../../shared/async-route.js";
import { routeParam } from "../../shared/params.js";
import { requireAuthUser } from "../../../middleware/auth.js";

export const calendarEventsRouter = express.Router();

const DAY_MS = 24 * 60 * 60 * 1000;
const dayTime = (day: string) => new Date(`${day}T00:00:00.000Z`).getTime();
/** Jour civil existant (refuse `2026-02-30`, que `Date` reporterait au 2 mars). */
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((day) => Number.isFinite(dayTime(day)) && new Date(dayTime(day)).toISOString().startsWith(day));

/** Plage bornée : `to` après `from`, au plus `CALENDAR_MAX_RANGE_DAYS` jours. */
const rangeQuerySchema = z.object({
  scope: z.enum(CALENDAR_SCOPES).default("portfolio"),
  from: isoDay,
  to: isoDay
}).refine(({ from, to }) => {
  const span = (dayTime(to) - dayTime(from)) / DAY_MS;
  return span >= 0 && span <= CALENDAR_MAX_RANGE_DAYS;
}, { message: `Plage de dates invalide (${CALENDAR_MAX_RANGE_DAYS} jours maximum).`, path: ["to"] });

/**
 * Sans plage : évènements les plus proches des positions (encart du dashboard). Avec `from` et
 * `to` : page Calendrier, périmètre au choix et montants de dividendes attendus.
 */
calendarEventsRouter.get("/calendar-events", asyncRoute(async (req, res) => {
  const userId = requireAuthUser(req).id;
  if (req.query["from"] === undefined && req.query["to"] === undefined) {
    res.json(readCalendarEventsForPortfolio(userId).map(mapEventRow));
    return;
  }
  res.json(await calendarEventsInRange(userId, rangeQuerySchema.parse(req.query)));
}));

/** Export iCalendar de la même plage, pour l'ajouter à un agenda. */
calendarEventsRouter.get("/calendar-events.ics", asyncRoute(async (req, res) => {
  const user = requireAuthUser(req);
  const query = rangeQuerySchema.parse(req.query);
  const events = await calendarEventsInRange(user.id, query);
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="pea-calendrier-${query.from}-${query.to}.ics"`);
  res.send(buildCalendarIcs(events, { language: user.language, timeZone: config.appTimezone, now: new Date() }));
}));

calendarEventsRouter.get("/calendar-events/:symbol", asyncRoute((req, res) => {
  const symbol = routeParam(req.params["symbol"], "symbol").toUpperCase();
  const rows = readCalendarEventsBySymbol(symbol);
  res.json(rows.map(mapEventRow));
}));
