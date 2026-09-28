import type { PortfolioCorrelation } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { formatRatio, MISSING_VALUE } from "../../../../lib/format-metrics";

/** Teintes des corrélations positives (diversification faible) et négatives, reprises de `coral` et `sky`. */
const POSITIVE_RGB = "251, 113, 133";
const NEGATIVE_RGB = "56, 189, 248";
/** Opacité maximale d'une case, pour garder la valeur lisible. */
const MAX_CELL_ALPHA = 0.75;

function cellBackground(value: number | null) {
  if (value === null) return undefined;
  return `rgba(${value >= 0 ? POSITIVE_RGB : NEGATIVE_RGB}, ${(Math.abs(value) * MAX_CELL_ALPHA).toFixed(3)})`;
}

/** Matrice complète (niveau 2) : pas d'animation sur ce tableau dense. */
export function CorrelationHeatmap({ correlation }: { correlation: PortfolioCorrelation }) {
  const { t } = useTranslation("common");
  const { assets, matrix } = correlation;

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th />
            {assets.map((asset) => (
              <th className="px-1 pb-1 font-semibold text-slate-300" key={asset.symbol} scope="col" title={asset.name}>{asset.symbol}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {assets.map((rowAsset, row) => (
            <tr key={rowAsset.symbol}>
              <th className="pr-2 text-left font-semibold text-slate-300" scope="row" title={rowAsset.name}>{rowAsset.symbol}</th>
              {assets.map((columnAsset, column) => {
                const value = matrix[row]?.[column] ?? null;
                const label = value === null ? MISSING_VALUE : formatRatio(value);
                return (
                  <td
                    className="h-9 min-w-[3rem] rounded text-center tabular-nums text-slate-100"
                    key={columnAsset.symbol}
                    style={{ backgroundColor: cellBackground(value) }}
                    title={t("analysis.correlation.cell", { a: rowAsset.name, b: columnAsset.name, value: label })}
                  >
                    {label}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
