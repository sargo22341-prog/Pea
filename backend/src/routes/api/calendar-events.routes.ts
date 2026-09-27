import express from "express";
import { mapEventRow, readCalendarEventsBySymbol, readCalendarEventsForPortfolio } from "../../repositories/calendar-events/calendar-events.repository.js";
import { asyncRoute } from "../shared/async-route.js";
import { routeParam } from "../shared/params.js";
import { requireAuthUser } from "../../middleware/auth.js";

export const calendarEventsRouter = express.Router();

calendarEventsRouter.get("/calendar-events", asyncRoute((req, res) => {
  const rows = readCalendarEventsForPortfolio(requireAuthUser(req).id);
  res.json(rows.map(mapEventRow));
}));

calendarEventsRouter.get("/calendar-events/:symbol", asyncRoute((req, res) => {
  const symbol = routeParam(req.params["symbol"], "symbol").toUpperCase();
  const rows = readCalendarEventsBySymbol(symbol);
  res.json(rows.map(mapEventRow));
}));
