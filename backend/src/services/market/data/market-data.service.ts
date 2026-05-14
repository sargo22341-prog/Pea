// Re-export legacy : `MarketDataService` a été renommée `MarketSnapshotOrchestrator`
// (Phase 3.4). Les imports historiques continuent à fonctionner. À retirer après audit complet.
export {
  MarketSnapshotOrchestrator as MarketDataService,
  marketSnapshotOrchestrator as marketDataService,
  type ChartDataOptions
} from "./market-snapshot-orchestrator.service.js";
