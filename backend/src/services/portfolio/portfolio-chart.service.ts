// Re-export legacy : `PortfolioChartService` a été renommée `PortfolioChartsService`
// (Phase 3.3). Les imports historiques continuent à fonctionner. À retirer après audit complet.
export {
  PortfolioChartsService as PortfolioChartService,
  portfolioChartsService as portfolioChartService
} from "./portfolio-charts.service.js";
