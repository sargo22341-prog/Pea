import type { AssetFundHolding, LookThroughItem, PortfolioLookThrough } from "@pea/shared";

export interface LookThroughPosition {
  symbol: string;
  name: string;
  /** Poids de la ligne dans le portefeuille (points). */
  weight: number;
  etf: boolean;
  /** Lignes détenues publiées par l'ETF (pondérations en fraction). */
  holdings?: AssetFundHolding[] | undefined;
}

function tickerBase(symbol: string) {
  return symbol.toUpperCase().split(".")[0] ?? "";
}

/**
 * Index des lignes détenues directement : par symbole exact, puis par ticker sans place de
 * cotation (Yahoo publie `ASML` dans un ETF quand le portefeuille détient `ASML.AS`). Un ticker
 * partagé par deux lignes directes est ambigu et n'est pas rapproché.
 */
function directIndex(direct: readonly LookThroughPosition[]) {
  const bySymbol = new Map<string, string>();
  const byBase = new Map<string, string | null>();
  for (const position of direct) {
    const key = position.symbol.toUpperCase();
    bySymbol.set(key, key);
    const base = tickerBase(key);
    byBase.set(base, byBase.has(base) ? null : key);
  }
  return (holding: AssetFundHolding) => {
    if (!holding.symbol) return `name:${holding.name.trim().toLowerCase()}`;
    const symbol = holding.symbol.toUpperCase();
    return bySymbol.get(symbol) ?? byBase.get(tickerBase(symbol)) ?? symbol;
  };
}

/**
 * Transparence des ETF : chaque ETF est « éclaté » selon ses lignes détenues pondérées par la
 * valeur de la position, puis fusionné avec les lignes détenues en direct. La part de l'ETF que
 * Yahoo ne détaille pas (au-delà des dix premières lignes) est comptée à part.
 */
export function lookThroughExposure(positions: readonly LookThroughPosition[]): PortfolioLookThrough {
  const direct = positions.filter((position) => !position.etf);
  const resolveKey = directIndex(direct);
  const items = new Map<string, LookThroughItem>();
  for (const position of direct) {
    const key = position.symbol.toUpperCase();
    const current = items.get(key);
    const directWeight = (current?.directWeight ?? 0) + position.weight;
    items.set(key, { key, symbol: position.symbol, name: position.name, directWeight, viaEtfWeight: 0, totalWeight: directWeight, viaEtf: [] });
  }

  let undisclosedEtfWeight = 0;
  let etfCount = 0;
  for (const etf of positions.filter((position) => position.etf)) {
    const holdings = etf.holdings ?? [];
    if (!holdings.length) {
      undisclosedEtfWeight += etf.weight;
      continue;
    }
    etfCount += 1;
    const disclosed = Math.min(1, holdings.reduce((sum, holding) => sum + holding.weight, 0));
    undisclosedEtfWeight += etf.weight * (1 - disclosed);
    for (const holding of holdings) {
      const key = resolveKey(holding);
      const exposure = etf.weight * holding.weight;
      const item = items.get(key) ?? { key, symbol: holding.symbol, name: holding.name, directWeight: 0, viaEtfWeight: 0, totalWeight: 0, viaEtf: [] };
      item.viaEtfWeight += exposure;
      item.totalWeight += exposure;
      const source = item.viaEtf.find((entry) => entry.symbol === etf.symbol);
      if (source) source.weight += exposure;
      else item.viaEtf.push({ symbol: etf.symbol, name: etf.name, weight: exposure });
      items.set(key, item);
    }
  }

  const sorted = [...items.values()]
    .map((item) => ({ ...item, viaEtf: [...item.viaEtf].sort((a, b) => b.weight - a.weight) }))
    .sort((a, b) => b.totalWeight - a.totalWeight);
  return { items: sorted, undisclosedEtfWeight, etfCount };
}
