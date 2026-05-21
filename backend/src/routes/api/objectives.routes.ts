import express from "express";
import { z } from "zod";
import { objectivesService } from "../../services/objectives/objectives.service.js";
import { objectiveInputSchema } from "../../services/objectives/objective-validation.js";
import { HttpError } from "../../utils/http-error.js";
import { asyncRoute } from "../shared/async-route.js";

export const objectivesRouter = express.Router();

const userIdSchema = z.coerce.number().int().positive();
const objectiveIdSchema = z.coerce.number().int().positive();

function requestedUserId(req: express.Request) {
  const userId = userIdSchema.parse(req.params.userId);
  if (userId !== req.user!.id && req.user!.role !== "admin") {
    throw new HttpError(403, "Acces interdit a ces objectifs.");
  }
  return userId;
}

objectivesRouter.get("/users/:userId/objectives", asyncRoute(async (req, res) => {
  res.json(await objectivesService.list(requestedUserId(req)));
}));

objectivesRouter.get("/users/:userId/objectives/:objectiveId", asyncRoute(async (req, res) => {
  res.json(await objectivesService.get(requestedUserId(req), objectiveIdSchema.parse(req.params.objectiveId)));
}));

objectivesRouter.post("/users/:userId/objectives", asyncRoute(async (req, res) => {
  const body = objectiveInputSchema.parse(req.body);
  res.status(201).json(await objectivesService.create(requestedUserId(req), body));
}));

objectivesRouter.put("/users/:userId/objectives/:objectiveId", asyncRoute(async (req, res) => {
  const body = objectiveInputSchema.parse(req.body);
  res.json(await objectivesService.update(requestedUserId(req), objectiveIdSchema.parse(req.params.objectiveId), body));
}));

objectivesRouter.delete("/users/:userId/objectives/:objectiveId", asyncRoute(async (req, res) => {
  objectivesService.delete(requestedUserId(req), objectiveIdSchema.parse(req.params.objectiveId));
  res.status(204).send();
}));

objectivesRouter.post("/users/:userId/objectives/:objectiveId/recalculate", asyncRoute(async (req, res) => {
  res.json(await objectivesService.recalculate(requestedUserId(req), objectiveIdSchema.parse(req.params.objectiveId)));
}));
