// Re-export legacy : `PostCloseFinalizationService` a été renommée `CandleFinalizationService`
// (Phase 3.4). Les imports historiques continuent à fonctionner. À retirer après audit complet.
export {
  CandleFinalizationService as PostCloseFinalizationService,
  candleFinalizationService as postCloseFinalizationService
} from "./candle-finalization.service.js";
