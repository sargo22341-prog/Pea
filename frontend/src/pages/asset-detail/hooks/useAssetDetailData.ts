import type { AssetDetails, ChartOverlayKey, RangeKey } from "@pea/shared";
import { useEffect, useMemo, useRef } from "react";
import { useAsync } from "../../../hooks/useAsync";
import { useLatestRef } from "../../../hooks/useLatestRef";
import { api } from "../../../lib/api";

/**
 * Données de la fiche actif.
 *
 * La fiche complète (cotation, fondamentaux, dividendes, actualités...) n'est chargée qu'au
 * changement d'actif, puis rechargée sur événement marché ou après une édition, toujours pour la
 * période et les calques courants. Un simple changement de période ou de calques ne demande que
 * ce qui en dépend : la courbe (avec ses moyennes mobiles) et la performance de la position.
 */
export function useAssetDetailData(symbol: string, range: RangeKey, overlays: readonly ChartOverlayKey[] = []) {
  const overlaysKey = overlays.join(",");
  const requestRef = useLatestRef({ range, overlays, overlaysKey });
  const details = useAsync(async () => {
    const requested = requestRef.current;
    return { range: requested.range, overlaysKey: requested.overlaysKey, data: await api.asset(symbol, requested.range, requested.overlays) };
  }, symbol);

  const needsRangeData = details.data !== null && (details.data.range !== range || details.data.overlaysKey !== overlaysKey);
  const positionId = details.data?.data.position?.id;
  const rangeChanged = details.data !== null && details.data.range !== range;
  const rangeData = useAsync(async (signal) => {
    if (!needsRangeData) return null;
    const [chart, positionRangePerformance] = await Promise.all([
      api.history(symbol, range, signal, requestRef.current.overlays),
      positionId === undefined || !rangeChanged ? Promise.resolve(undefined) : api.positionPerformance(positionId, range, signal)
    ]);
    return { range, overlaysKey, chart, positionRangePerformance };
  }, `${symbol}:${range}:${overlaysKey}:${String(needsRangeData)}:${String(positionId)}`);

  // Si la mise à jour partielle échoue, on retombe une fois sur la fiche complète de la période.
  const fallbackRequestedFor = useRef<string | null>(null);
  const detailsReload = details.reload;
  useEffect(() => {
    const key = `${symbol}:${range}:${overlaysKey}`;
    if (!rangeData.error || fallbackRequestedFor.current === key) return;
    fallbackRequestedFor.current = key;
    void detailsReload();
  }, [detailsReload, overlaysKey, range, rangeData.error, symbol]);

  const partial = needsRangeData && rangeData.data?.range === range && rangeData.data.overlaysKey === overlaysKey ? rangeData.data : undefined;
  const data = useMemo<AssetDetails | null>(() => {
    if (!details.data) return null;
    if (!partial) return details.data.data;
    return {
      ...details.data.data,
      chart: partial.chart,
      positionRangePerformance: partial.positionRangePerformance ?? details.data.data.positionRangePerformance
    };
  }, [details.data, partial]);

  return {
    data,
    error: details.error,
    loading: details.loading || (needsRangeData && !partial),
    reload: details.reload
  };
}
