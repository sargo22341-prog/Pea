import type { AssetDetails, RangeKey } from "@pea/shared";
import { useEffect, useMemo, useRef } from "react";
import { useAsync } from "../../../hooks/useAsync";
import { useLatestRef } from "../../../hooks/useLatestRef";
import { api } from "../../../lib/api";

/**
 * Données de la fiche actif.
 *
 * La fiche complète (cotation, fondamentaux, dividendes, actualités...) n'est chargée qu'au
 * changement d'actif, puis rechargée sur événement marché ou après une édition, toujours pour la
 * période courante. Un simple changement de période ne demande que ce qui en dépend : la courbe
 * et la performance de la position sur cette période.
 */
export function useAssetDetailData(symbol: string, range: RangeKey) {
  const rangeRef = useLatestRef(range);
  const details = useAsync(async () => {
    const requestedRange = rangeRef.current;
    return { range: requestedRange, data: await api.asset(symbol, requestedRange) };
  }, symbol);

  const loadedRange = details.data?.range;
  const needsRangeData = details.data !== null && loadedRange !== range;
  const positionId = details.data?.data.position?.id;
  const rangeData = useAsync(async (signal) => {
    if (!needsRangeData) return null;
    const [chart, positionRangePerformance] = await Promise.all([
      api.history(symbol, range, signal),
      positionId === undefined ? Promise.resolve(undefined) : api.positionPerformance(positionId, range, signal)
    ]);
    return { range, chart, positionRangePerformance };
  }, `${symbol}:${range}:${String(needsRangeData)}:${String(positionId)}`);

  // Si la mise à jour partielle échoue, on retombe une fois sur la fiche complète de la période.
  const fallbackRequestedFor = useRef<string | null>(null);
  const detailsReload = details.reload;
  useEffect(() => {
    const key = `${symbol}:${range}`;
    if (!rangeData.error || fallbackRequestedFor.current === key) return;
    fallbackRequestedFor.current = key;
    void detailsReload();
  }, [detailsReload, range, rangeData.error, symbol]);

  const partial = needsRangeData && rangeData.data?.range === range ? rangeData.data : undefined;
  const data = useMemo<AssetDetails | null>(() => {
    if (!details.data) return null;
    if (!partial) return details.data.data;
    return { ...details.data.data, chart: partial.chart, positionRangePerformance: partial.positionRangePerformance };
  }, [details.data, partial]);

  return {
    data,
    error: details.error,
    loading: details.loading || (needsRangeData && !partial),
    reload: details.reload
  };
}
