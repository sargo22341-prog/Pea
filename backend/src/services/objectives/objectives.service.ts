import type { ObjectiveDto, ObjectiveInput, ObjectiveListDto } from "@pea/shared";
import { objectivesRepository, type ObjectiveRow } from "../../repositories/objectives/objectives.repository.js";
import { authRepository } from "../../repositories/auth/auth.repository.js";
import { HttpError } from "../../utils/http-error.js";
import { objectiveCalculatorService } from "./objective-calculator.service.js";
import { objectivePortfolioService } from "./objective-portfolio.service.js";
import { mapObjective } from "./objectives.mapper.js";

function nextUpdateAtFromProjection(projection: { nextUpdateAt?: string }, now: Date) {
  if (projection.nextUpdateAt) return projection.nextUpdateAt;
  const next = new Date(now);
  next.setHours(23, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

export class ObjectivesService {
  async list(userId: number): Promise<ObjectiveListDto> {
    const rows = objectivesRepository.list(userId);
    if (rows.length === 0) {
      const created = await this.create(userId, this.defaultObjective());
      return { objectives: [created] };
    }
    return { objectives: rows.map(mapObjective) };
  }

  async get(userId: number, objectiveId: number): Promise<ObjectiveDto> {
    const row = objectivesRepository.find(userId, objectiveId);
    if (!row) throw new HttpError(404, "Objectif introuvable");
    if (!row.projection_json) return this.recalculate(userId, objectiveId);
    return mapObjective(row);
  }

  async create(userId: number, input: ObjectiveInput): Promise<ObjectiveDto> {
    const row = objectivesRepository.create({ userId, ...input, active: input.active ?? true });
    await this.recalculateRow(row);
    return this.get(userId, row.id);
  }

  async update(userId: number, objectiveId: number, input: ObjectiveInput): Promise<ObjectiveDto> {
    const row = objectivesRepository.update(userId, objectiveId, { ...input, active: input.active ?? true });
    if (!row) throw new HttpError(404, "Objectif introuvable");
    return this.recalculate(userId, objectiveId);
  }

  delete(userId: number, objectiveId: number): void {
    if (!objectivesRepository.delete(userId, objectiveId)) throw new HttpError(404, "Objectif introuvable");
  }

  async recalculate(userId: number, objectiveId: number): Promise<ObjectiveDto> {
    const row = objectivesRepository.find(userId, objectiveId);
    if (!row) throw new HttpError(404, "Objectif introuvable");
    await this.recalculateRow(row);
    return mapObjective(objectivesRepository.find(userId, objectiveId)!);
  }

  async recalculateActive(now = new Date()): Promise<{ recalculated: number; failed: number }> {
    let recalculated = 0;
    let failed = 0;
    for (const row of objectivesRepository.listActive()) {
      try {
        await this.recalculateRow(row, now);
        recalculated += 1;
      } catch {
        failed += 1;
      }
    }
    return { recalculated, failed };
  }

  async recalculateActiveForUser(userId: number, now = new Date()): Promise<{ recalculated: number; failed: number }> {
    let recalculated = 0;
    let failed = 0;
    for (const row of objectivesRepository.listActiveForUser(userId)) {
      try {
        await this.recalculateRow(row, now);
        recalculated += 1;
      } catch {
        failed += 1;
      }
    }
    return { recalculated, failed };
  }

  private async recalculateRow(row: ObjectiveRow, now = new Date()) {
    const input = mapObjective(row);
    const user = authRepository.findUserById(row.user_id);
    input.assumptions.projectionEndAge = Math.min(120, Math.max(70, Number(user?.projection_end_age ?? input.assumptions.projectionEndAge ?? 90)));
    const portfolio = await objectivePortfolioService.snapshot(row.user_id, input.assumptions.currentAge);
    const projection = objectiveCalculatorService.calculate(input, portfolio, now);
    objectivesRepository.upsertProjection(row.user_id, row.id, projection, now.toISOString(), nextUpdateAtFromProjection(projection, now));
  }

  private defaultObjective(): ObjectiveInput {
    return {
      title: "Rente avec consommation du capital",
      type: "annuity_consuming_capital",
      active: true,
      config: {
        monthlyIncome: 3000,
        indexIncomeToInflation: true
      },
      assumptions: {
        futureMonthlySavings: null,
        inflationRate: 2.5,
        annualReturnRate: 7,
        taxRate: 21,
        withdrawalRate: 4,
        projectionEndAge: 90,
        statePensionMonthly: 1000,
        statePensionStartAge: 67,
        scenario: "normal"
      }
    };
  }
}

export const objectivesService = new ObjectivesService();
