import express from "express";
import { z } from "zod";
import { requireAuthUser } from "../../../middleware/auth.js";
import { dividendProposalsService } from "../../../services/cash/dividends/dividend-proposals.service.js";
import { openingDividendsService } from "../../../services/cash/opening-dividends.js";
import { asyncRoute } from "../../shared/async-route.js";
import { isoDateTimeSchema } from "../../shared/date-time.schema.js";

export const dividendProposalsRouter = express.Router();

const maxAmount = 1_000_000_000;
const idSchema = z.coerce.number().int().positive();

/** Montant et date facultatifs : fournis, ils corrigent les valeurs proposées (ou enregistrées). */
const acceptSchema = z.object({
  amount: z.coerce.number().positive().max(maxAmount).optional(),
  effectiveAt: isoDateTimeSchema.optional(),
  confirmUncertify: z.boolean().optional()
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

dividendProposalsRouter.post("/cash/dividend-proposals/:id/correct", asyncRoute((req, res) => {
  const id = idSchema.parse(req.params["id"]);
  res.json(dividendProposalsService.correct(requireAuthUser(req).id, id, acceptSchema.parse(req.body ?? {})));
}));

dividendProposalsRouter.post("/cash/dividend-proposals/notifications/read", asyncRoute((req, res) => {
  res.json(dividendProposalsService.markNotificationsRead(requireAuthUser(req).id));
}));

const settingsSchema = z.object({ autoAccept: z.boolean() }).strict();

dividendProposalsRouter.get("/cash/dividend-settings", asyncRoute((req, res) => {
  res.json(dividendProposalsService.settings(requireAuthUser(req).id));
}));

dividendProposalsRouter.put("/cash/dividend-settings", asyncRoute((req, res) => {
  res.json(dividendProposalsService.updateSettings(requireAuthUser(req).id, settingsSchema.parse(req.body)));
}));

const openingDividendsSchema = z.object({ amount: z.number().nonnegative().max(maxAmount).nullable() }).strict();

dividendProposalsRouter.get("/cash/account/opening-dividends", asyncRoute((req, res) => {
  res.json(openingDividendsService.estimate(requireAuthUser(req).id));
}));

dividendProposalsRouter.put("/cash/account/opening-dividends", asyncRoute((req, res) => {
  res.json(openingDividendsService.confirm(requireAuthUser(req).id, openingDividendsSchema.parse(req.body).amount));
}));
