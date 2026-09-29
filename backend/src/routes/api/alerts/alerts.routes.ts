import express from "express";
import { requireAuthUser } from "../../../middleware/auth.js";
import { featureFlagsService } from "../../../services/admin/feature-flags.service.js";
import { alertsService } from "../../../services/alerts/alerts.service.js";
import { asyncRoute } from "../../shared/async-route.js";
import { alertIdSchema, assertParamsForType, createAlertSchema, eventsQuerySchema, updateAlertSchema } from "./alerts.schema.js";

/** Alertes de l'utilisateur courant : toute alerte d'un autre utilisateur répond 404. */
export const alertsRouter = express.Router();

alertsRouter.use("/alerts", (_req, _res, next) => {
  featureFlagsService.assertEnabled("alerts");
  next();
});

alertsRouter.get("/alerts", asyncRoute((req, res) => {
  res.json(alertsService.list(requireAuthUser(req).id));
}));

alertsRouter.post("/alerts", asyncRoute((req, res) => {
  res.status(201).json(alertsService.create(requireAuthUser(req).id, createAlertSchema.parse(req.body)));
}));

alertsRouter.get("/alerts/events", asyncRoute((req, res) => {
  const { limit } = eventsQuerySchema.parse(req.query);
  res.json(alertsService.events(requireAuthUser(req).id, limit));
}));

alertsRouter.post("/alerts/events/read", asyncRoute((req, res) => {
  alertsService.markAllRead(requireAuthUser(req).id);
  res.status(204).end();
}));

alertsRouter.patch("/alerts/:id", asyncRoute((req, res) => {
  const userId = requireAuthUser(req).id;
  const { id } = alertIdSchema.parse(req.params);
  const changes = updateAlertSchema.parse(req.body);
  assertParamsForType(alertsService.get(userId, id).type, changes.params);
  res.json(alertsService.update(userId, id, changes));
}));

alertsRouter.delete("/alerts/:id", asyncRoute((req, res) => {
  const { id } = alertIdSchema.parse(req.params);
  alertsService.remove(requireAuthUser(req).id, id);
  res.status(204).end();
}));
