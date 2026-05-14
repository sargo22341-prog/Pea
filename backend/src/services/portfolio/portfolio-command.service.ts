// Re-export legacy : `PortfolioCommandService` a été renommée `PortfolioWriteService`
// (Phase 3.3). Les imports historiques continuent à fonctionner. À retirer après audit complet.
export {
  PortfolioWriteService as PortfolioCommandService,
  portfolioWriteService as portfolioCommandService
} from "./portfolio-write.service.js";
