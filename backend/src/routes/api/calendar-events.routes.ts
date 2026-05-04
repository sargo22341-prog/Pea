/**
 * Role du fichier : exposer les evenements calendrier stockes en base.
 * GET /api/calendar-events          → evenements des actifs du portfolio
 * GET /api/calendar-events/:symbol  → evenements d'un actif specifique
 */

import express from "express";
import { currentUserId } from "../../services/auth/user-context.js";
import { mapEventRow, readCalendarEventsBySymbol, readCalendarEventsForPortfolio } from "../../services/calendar-events/calendar-events.repository.js";
import { asyncRoute } from "../shared/async-route.js";
import { routeParam } from "../shared/params.js";

export const calendarEventsRouter = express.Router();

calendarEventsRouter.get("/calendar-events", asyncRoute(async (_req, res) => {
  const rows = readCalendarEventsForPortfolio(currentUserId());
  res.json(rows.map(mapEventRow));
}));

calendarEventsRouter.get("/calendar-events/:symbol", asyncRoute(async (req, res) => {
  const symbol = routeParam(req.params.symbol, "symbol").toUpperCase();
  const rows = readCalendarEventsBySymbol(symbol);
  res.json(rows.map(mapEventRow));
}));
