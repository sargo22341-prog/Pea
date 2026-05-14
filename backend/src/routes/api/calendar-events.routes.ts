import express from "express";
import { mapEventRow, readCalendarEventsBySymbol, readCalendarEventsForPortfolio } from "../../repositories/calendar-events/calendar-events.repository.js";
import { asyncRoute } from "../shared/async-route.js";
import { routeParam } from "../shared/params.js";

export const calendarEventsRouter = express.Router();

calendarEventsRouter.get("/calendar-events", asyncRoute(async (req, res) => {
  const rows = readCalendarEventsForPortfolio(req.user!.id);
  res.json(rows.map(mapEventRow));
}));

calendarEventsRouter.get("/calendar-events/:symbol", asyncRoute(async (req, res) => {
  const symbol = routeParam(req.params.symbol, "symbol").toUpperCase();
  const rows = readCalendarEventsBySymbol(symbol);
  res.json(rows.map(mapEventRow));
}));
