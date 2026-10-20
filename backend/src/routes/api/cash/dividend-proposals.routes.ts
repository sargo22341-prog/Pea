import express from "express";
import { z } from "zod";
import { requireAuthUser } from "../../../middleware/auth.js";
import { dividendProposalsService } from "../../../services/cash/dividends/dividend-proposals.service.js";
import { asyncRoute } from "../../shared/async-route.js";
import { isoDateTimeSchema } from "../../shared/date-time.schema.js";

export const dividendProposalsRouter = express.Router();

const maxAmount = 1_000_000_000;
const idSchema = z.coerce.number().int().positive();

/** Montant et date facultatifs : fournis, ils corrigent les valeurs proposées. */
const acceptSchema = z.object({
  amount: z.coerce.number().positive().max(maxAmount).optional(),
  effectiveAt: isoDateTimeSchema.optional()
}).strict();

dividendProposalsRouter.get("/cash/dividend-proposals", asyncRoute((req, res) => {
  res.json(dividendProposalsService.list(requireAuthUser(req).id));
}));

dividendProposalsRouter.post("/cash/dividend-proposals/:id/accept", asyncRoute((req, res) => {
  const id = idSchema.parse(req.params["id"]);
  res.json(dividendProposalsService.accept(requireAuthUser(req).id, id, acceptSchema.parse(req.body ?? {})));
}));

dividendProposalsRouter.post("/cash/dividend-proposals/:id/ignore", asyncRoute((req, res) => {
  res.json(dividendProposalsService.ignore(requireAuthUser(req).id, idSchema.parse(req.params["id"])));
}));

dividendProposalsRouter.post("/cash/dividend-proposals/:id/restore", asyncRoute((req, res) => {
  res.json(dividendProposalsService.restore(requireAuthUser(req).id, idSchema.parse(req.params["id"])));
}));
