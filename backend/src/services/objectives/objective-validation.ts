import { z } from "zod";

export const objectiveTypeSchema = z.enum([
  "fixed_capital",
  "annuity_consuming_capital",
  "annuity_preserve_capital",
  "annuity_target_final_capital"
]);

export const objectiveAssumptionsSchema = z.object({
  currentAge: z.coerce.number().int().min(0).max(120).optional(),
  futureMonthlySavings: z.preprocess((value) => value === null || value === undefined || value === "" ? undefined : value, z.coerce.number().min(0).optional().nullable()),
  inflationRate: z.coerce.number().min(0).max(100).default(2.5),
  annualReturnRate: z.coerce.number().min(-100).max(100).default(7),
  taxRate: z.coerce.number().min(0).max(100).default(21),
  withdrawalRate: z.coerce.number().min(0.1).max(20).default(4).optional(),
  projectionEndAge: z.coerce.number().int().min(70).max(120).default(90).optional(),
  statePensionMonthly: z.coerce.number().min(0).default(1000),
  statePensionStartAge: z.coerce.number().int().min(0).max(120).default(67),
  scenario: z.enum(["prudent", "normal", "optimistic"]).default("normal")
});

export const objectiveConfigSchema = z.object({
  targetAmount: z.coerce.number().positive().optional(),
  targetAge: z.coerce.number().int().min(0).max(120).optional(),
  monthlyIncome: z.coerce.number().positive().optional(),
  indexIncomeToInflation: z.coerce.boolean().default(false).optional(),
  continueSavingsAfterAnnuityStart: z.coerce.boolean().default(false).optional(),
  finalCapitalTarget: z.coerce.number().min(0).optional()
});

export const objectiveInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  type: objectiveTypeSchema,
  active: z.coerce.boolean().default(true),
  config: objectiveConfigSchema.default({}),
  assumptions: objectiveAssumptionsSchema.default({
    futureMonthlySavings: null,
    inflationRate: 2.5,
    annualReturnRate: 7,
    taxRate: 21,
    withdrawalRate: 4,
    projectionEndAge: 90,
    statePensionMonthly: 1000,
    statePensionStartAge: 67,
    scenario: "normal"
  })
});
