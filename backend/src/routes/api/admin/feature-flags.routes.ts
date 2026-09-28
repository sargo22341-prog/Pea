import { APP_FEATURE_KEYS } from "@pea/shared";
import express from "express";
import { z } from "zod";
import { requireAuthUser } from "../../../middleware/auth.js";
import { featureFlagsService } from "../../../services/admin/feature-flags.service.js";
import { asyncRoute } from "../../shared/async-route.js";

/** Routes montées derrière `requireAdmin` (voir `routes/api.ts`). */
export const featureFlagsRouter = express.Router();

const featureChangesSchema = z.object({
  features: z
    .partialRecord(z.enum(APP_FEATURE_KEYS), z.boolean())
    .refine((features) => Object.keys(features).length > 0, "Aucune fonctionnalite a modifier.")
}).strict();

featureFlagsRouter.get("/admin/features", asyncRoute((_req, res) => {
  res.json(featureFlagsService.list());
}));

featureFlagsRouter.put("/admin/features", asyncRoute((req, res) => {
  const { features } = featureChangesSchema.parse(req.body);
  res.json(featureFlagsService.update(features, requireAuthUser(req).id));
}));
