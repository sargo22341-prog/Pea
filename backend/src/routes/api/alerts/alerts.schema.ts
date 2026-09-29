import { z } from "zod";
import { ALERT_LIMITS, ALERT_THRESHOLD_TYPES, ALERT_TYPES, MA200_CROSS_DIRECTIONS, type AlertParams, type AlertType } from "@pea/shared";
import { yahooSymbolSchema } from "../../shared/symbol.js";

export const alertParamsSchema = z.strictObject({
  threshold: z.number().positive().optional(),
  direction: z.enum(MA200_CROSS_DIRECTIONS).optional(),
  cooldownHours: z.number().int().min(ALERT_LIMITS.cooldownHours.min).max(ALERT_LIMITS.cooldownHours.max).optional()
});

/** Cohérence des paramètres avec le type : seuil obligatoire et borné, direction réservée à la MM200. */
export function alertParamsIssue(type: AlertType, params: AlertParams): string | undefined {
  const needsThreshold = ALERT_THRESHOLD_TYPES.includes(type);
  if (needsThreshold && params.threshold === undefined) return "Seuil obligatoire pour ce type d'alerte.";
  if (!needsThreshold && params.threshold !== undefined) return "Ce type d'alerte n'accepte pas de seuil.";
  const limits = type === "daily_change" ? ALERT_LIMITS.dailyChangePercent : ALERT_LIMITS.price;
  if (params.threshold !== undefined && (params.threshold < limits.min || params.threshold > limits.max)) return "Seuil hors des bornes autorisees.";
  if (params.direction !== undefined && type !== "ma200_cross") return "La direction ne concerne que la moyenne mobile 200 jours.";
  return undefined;
}

function refineParams(type: AlertType, params: AlertParams, context: z.RefinementCtx) {
  const issue = alertParamsIssue(type, params);
  if (issue) context.addIssue({ code: "custom", message: issue, path: ["params"] });
}

export const createAlertSchema = z.strictObject({
  symbol: yahooSymbolSchema,
  type: z.enum(ALERT_TYPES),
  params: alertParamsSchema.default({})
}).superRefine((value, context) => { refineParams(value.type, value.params, context); });

export const updateAlertSchema = z.strictObject({
  active: z.boolean().optional(),
  params: alertParamsSchema.optional()
}).refine((value) => value.active !== undefined || value.params !== undefined, { message: "Aucune modification demandee." });

/** Vérifie les nouveaux paramètres d'une alerte existante contre son type (lève une ZodError, donc 400). */
export function assertParamsForType(type: AlertType, params: AlertParams | undefined) {
  const issue = params ? alertParamsIssue(type, params) : undefined;
  if (issue) throw new z.ZodError([{ code: "custom", message: issue, path: ["params"], input: params }]);
}

export const alertIdSchema = z.object({ id: z.coerce.number().int().positive() });
export const eventsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(ALERT_LIMITS.historyPageSize).default(ALERT_LIMITS.historyPageSize) });
