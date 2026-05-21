import { objectivesService } from "../../services/objectives/objectives.service.js";
import { logger } from "../../services/shared/logger.service.js";

export class ObjectiveProjectionRefreshTask {
  async run(now = new Date()) {
    const result = await objectivesService.recalculateActive(now);
    logger.info("portfolio", "daily objective projections refreshed", result);
    return result;
  }
}

export const objectiveProjectionRefreshTask = new ObjectiveProjectionRefreshTask();
