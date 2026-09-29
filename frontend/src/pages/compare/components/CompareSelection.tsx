import { COMPARE_MAX_SYMBOLS, type CompareAssetDto } from "@pea/shared";
import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AssetIcon } from "../../../components/common/AssetIcon";
import { MOTION } from "../../../components/common/motion";

/** Actifs sélectionnés (lien vers leur fiche, retrait) et bouton d'ajout. */
export function CompareSelection({
  symbols,
  assets,
  onAdd,
  onRemove
}: {
  symbols: readonly string[];
  assets: readonly CompareAssetDto[];
  onAdd: () => void;
  onRemove: (symbol: string) => void;
}) {
  const { t } = useTranslation("compare");
  const names = new Map(assets.map((asset) => [asset.symbol, asset.name]));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {symbols.map((symbol) => (
        <span className={`inline-flex max-w-full items-center gap-2 rounded-md border border-line bg-panel2 py-1 pl-2 pr-1 text-sm ${MOTION.rise}`} key={symbol}>
          <Link className="flex min-w-0 items-center gap-2 hover:text-sky" to={`/assets/${encodeURIComponent(symbol)}`}>
            <AssetIcon className="h-5 w-5" symbol={symbol} />
            <span className="truncate font-semibold">{names.get(symbol) ?? symbol}</span>
            <span className="shrink-0 text-xs text-slate-500">{symbol}</span>
          </Link>
          <button aria-label={t("selection.remove", { symbol })} className="rounded p-1 text-slate-400 hover:bg-panel hover:text-coral" onClick={() => { onRemove(symbol); }} type="button">
            <X size={14} />
          </button>
        </span>
      ))}
      {symbols.length < COMPARE_MAX_SYMBOLS && (
        <button className="btn-ghost" onClick={onAdd} type="button">
          <Plus size={16} />
          {t("selection.add")}
        </button>
      )}
    </div>
  );
}
