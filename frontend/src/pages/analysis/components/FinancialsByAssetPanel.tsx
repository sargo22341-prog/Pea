import type { AssetFinancials } from "@pea/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FinancialComboChart } from "../../../components/charts/financial/FinancialComboChart";
import { AssetIcon } from "../../../components/common/AssetIcon";

/** Chiffre d'affaires, résultat net et marge d'une action du portefeuille, choisie dans une liste. */
export function FinancialsByAssetPanel({ assets }: { assets: AssetFinancials[] }) {
  const { t } = useTranslation("common");
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const selected = assets.find((asset) => asset.symbol === selectedSymbol) ?? assets[0];

  return (
    <>
      <label className="mb-4 grid gap-1 text-sm text-slate-300 sm:max-w-sm">
        <span>{t("analysis.stock")}</span>
        <select className="input" onChange={(event) => { setSelectedSymbol(event.target.value); }} value={selected?.symbol ?? ""}>
          {assets.map((asset) => (
            <option key={asset.symbol} value={asset.symbol}>
              {asset.name}
            </option>
          ))}
        </select>
        {selected ? (
          <span className="mt-1 flex min-w-0 items-center gap-2 text-xs text-slate-400">
            <AssetIcon className="h-7 w-7" symbol={selected.symbol} />
            <span className="truncate">{selected.name}</span>
          </span>
        ) : null}
      </label>
      <FinancialComboChart data={selected?.financials ?? []} />
    </>
  );
}
