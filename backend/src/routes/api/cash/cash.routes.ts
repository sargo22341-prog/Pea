import { CASH_MOVEMENT_TYPES } from "@pea/shared";
import express from "express";
import { z } from "zod";
import { requireAuthUser } from "../../../middleware/auth.js";
import { cashAccountService } from "../../../services/cash/cash-account.service.js";
import { cashMovementsService } from "../../../services/cash/cash-movements.service.js";
import { asyncRoute } from "../../shared/async-route.js";
import { cashFundingSchema, isoDateTimeSchema } from "../../shared/date-time.schema.js";

export const cashRouter = express.Router();

const maxAmount = 1_000_000_000;
const amountSchema = z.coerce.number().positive().max(maxAmount);
const nonNegativeAmountSchema = z.coerce.number().nonnegative().max(maxAmount);

const movementSchema = z.object({
  type: z.enum(CASH_MOVEMENT_TYPES),
  amount: amountSchema,
  effectiveAt: isoDateTimeSchema,
  positionId: z.coerce.number().int().positive().optional(),
  note: z.string().trim().max(200).optional(),
  funding: cashFundingSchema
});

const accountSchema = z.object({
  referenceAt: isoDateTimeSchema,
  openedAt: isoDateTimeSchema.nullable().optional(),
  cash: nonNegativeAmountSchema,
  deposits: nonNegativeAmountSchema,
  withdrawals: nonNegativeAmountSchema
});

cashRouter.get("/cash", asyncRoute((req, res) => {
  res.json(cashAccountService.ledger(requireAuthUser(req).id));
}));

cashRouter.put("/cash/account", asyncRoute((req, res) => {
  res.json(cashMovementsService.configure(requireAuthUser(req).id, accountSchema.parse(req.body)));
}));

cashRouter.post("/cash/movements", asyncRoute((req, res) => {
  res.status(201).json(cashMovementsService.create(requireAuthUser(req).id, movementSchema.parse(req.body)));
}));

cashRouter.delete("/cash/movements/:id", asyncRoute((req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params["id"]);
  res.json(cashMovementsService.delete(requireAuthUser(req).id, id));
}));
