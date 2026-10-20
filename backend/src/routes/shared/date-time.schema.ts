import { z } from "zod";

/** Date saisie (ISO ou locale) normalisée en ISO UTC ; refusée si illisible. */
export const isoDateTimeSchema = z.string().trim().min(1).transform((value, context) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    context.addIssue({ code: "custom", message: "Date invalide." });
    return z.NEVER;
  }
  return date.toISOString();
});

/** Versement confirmé par l'utilisateur pour financer une opération (voir `withCashGuard`). */
export const cashFundingSchema = z.object({ amount: z.coerce.number().positive().max(1_000_000_000) }).optional();
