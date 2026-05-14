// Re-export legacy : `PortfolioQueryService` a été renommée `PortfolioReadService`
// (Phase 3.3). Les imports historiques continuent à fonctionner. À retirer après audit complet.
export {
  PortfolioReadService as PortfolioQueryService,
  portfolioReadService as portfolioQueryService
} from "./portfolio-read.service.js";
