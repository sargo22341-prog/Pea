import type { ChartOverlayKey } from "@pea/shared";

/** Paramètre `&overlays=ma50,ma200` ; vide quand aucun calque n'est demandé. */
export function overlaysQuery(overlays: readonly ChartOverlayKey[]) {
  return overlays.length ? `&overlays=${overlays.join(",")}` : "";
}
