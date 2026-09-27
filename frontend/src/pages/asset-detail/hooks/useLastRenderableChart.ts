import type { AssetChartDto, AssetDetails, RangeKey } from "@pea/shared";
import { useState } from "react";

function isRenderableFor(asset: AssetDetails | null | undefined, symbol: string): AssetChartDto | undefined {
  const chart = asset?.chart;
  if (!chart || chart.timestamps.length <= 1) return undefined;
  return asset.quote.symbol.toUpperCase() === symbol.toUpperCase() ? chart : undefined;
}

/**
 * Dernier graphique affichable pour le couple symbole/periode courant, conserve pendant qu'un nouveau
 * graphique se prepare. Remis a zero au changement de symbole ou de periode, mis a jour quand un
 * graphique exploitable arrive. L'etat est ajuste pendant le rendu plutot que dans un effet.
 */
export function useLastRenderableChart(asset: AssetDetails | null | undefined, symbol: string, range: RangeKey) {
  const chartKey = `${symbol}:${range}`;
  const candidate = isRenderableFor(asset, symbol);
  const [state, setState] = useState(() => ({ key: chartKey, chart: candidate }));
  const [observed, setObserved] = useState(() => ({ chart: asset?.chart, quoteSymbol: asset?.quote.symbol, symbol }));

  let next = state.key === chartKey ? state : { key: chartKey, chart: undefined };
  if (observed.chart !== asset?.chart || observed.quoteSymbol !== asset?.quote.symbol || observed.symbol !== symbol) {
    setObserved({ chart: asset?.chart, quoteSymbol: asset?.quote.symbol, symbol });
    if (candidate) next = { key: chartKey, chart: candidate };
  }
  if (next !== state) setState(next);
  return next.chart;
}
