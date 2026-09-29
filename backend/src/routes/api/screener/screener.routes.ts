import express from "express";
import { requireAuthUser } from "../../../middleware/auth.js";
import { screenerService } from "../../../services/screener/screener.service.js";
import { asyncRoute } from "../../shared/async-route.js";
import { parseScreenerQuery, presetBodySchema, presetParamsSchema } from "./screener.schema.js";

/** Screener PEA : filtrage local (aucun appel Yahoo) et filtres enregistrés par utilisateur. */
export const screenerRouter = express.Router();

screenerRouter.get("/screener", asyncRoute((req, res) => {
  res.json(screenerService.search(parseScreenerQuery(req.query)));
}));

screenerRouter.get("/screener/options", asyncRoute((_req, res) => {
  res.json(screenerService.options());
}));

screenerRouter.get("/screener/presets", asyncRoute((req, res) => {
  res.json(screenerService.listPresets(requireAuthUser(req).id));
}));

screenerRouter.post("/screener/presets", asyncRoute((req, res) => {
  const { name, filters } = presetBodySchema.parse(req.body);
  res.status(201).json(screenerService.savePreset(requireAuthUser(req).id, name, filters));
}));

screenerRouter.delete("/screener/presets/:id", asyncRoute((req, res) => {
  const { id } = presetParamsSchema.parse(req.params);
  screenerService.deletePreset(requireAuthUser(req).id, id);
  res.status(204).end();
}));
