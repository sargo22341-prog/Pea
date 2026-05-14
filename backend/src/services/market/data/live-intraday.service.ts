// Re-export legacy : `LiveIntradayService` a été renommée `LiveChartService` (Phase 3.4).
// Les imports historiques continuent à fonctionner. À retirer après audit complet des callers.
export { LiveChartService as LiveIntradayService, liveChartService as liveIntradayService } from "./live-chart.service.js";
