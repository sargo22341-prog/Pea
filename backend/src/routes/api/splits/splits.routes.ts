import express from "express";
import { z } from "zod";
import { requireAuthUser } from "../../../middleware/auth.js";
import { splitDecisionService } from "../../../services/portfolio/splits/split-decision.service.js";
import { asyncRoute } from "../../shared/async-route.js";

export const splitsRouter = express.Router();

const listQuerySchema = z.object({ symbol: z.string().trim().min(1).max(32).optional() });
const decisionParamsSchema = z.object({ id: z.coerce.number().int().positive() });
const decisionBodySchema = z.object({ decision: z.enum(["apply", "ignore"]) });

/** Divisions d'actions qui concernent les positions de l'utilisateur courant. */
splitsRouter.get("/splits", asyncRoute((req, res) => {
  const query = listQuerySchema.parse(req.query);
  res.json(splitDecisionService.listForUser(requireAuthUser(req).id, query.symbol));
}));

splitsRouter.post("/splits/:id/decision", asyncRoute((req, res) => {
  const { id } = decisionParamsSchema.parse(req.params);
  const { decision } = decisionBodySchema.parse(req.body);
  res.json(splitDecisionService.decide(requireAuthUser(req).id, id, decision));
}));
