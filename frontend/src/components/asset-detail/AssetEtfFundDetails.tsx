import { Building2, Coins, Percent, Repeat2 } from "lucide-react";
import type { AllocationChartItem } from "@pea/shared";
import { AssetInfoTile } from "./AssetInfoTile";
import { SectorAllocationChart } from "../charts/SectorAllocationChart";

const fakeSectorData: AllocationChartItem[] = [
  { name: "Immobilier", value: 0.0188, percentage: 1.88, symbols: [] },
  { name: "Consommation cyclique", value: 0.0928, percentage: 9.28, symbols: [] },
  { name: "Matériaux de base", value: 0.0345, percentage: 3.45, symbols: [] },
  { name: "Consommation défensive", value: 0.0559, percentage: 5.59, symbols: [] },
  { name: "Technologie", value: 0.2644, percentage: 26.44, symbols: [] },
  { name: "Communication", value: 0.087, percentage: 8.7, symbols: [] },
  { name: "Services financiers", value: 0.1603, percentage: 16.03, symbols: [] },
  { name: "Services publics", value: 0.0286, percentage: 2.86, symbols: [] },
  { name: "Industrie", value: 0.1141, percentage: 11.41, symbols: [] },
  { name: "Énergie", value: 0.0471, percentage: 4.71, symbols: [] },
  { name: "Santé", value: 0.096599996, percentage: 9.66, symbols: [] }
];

export function AssetEtfFundDetails() {
  return (
    <section className="w-full">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">
        Informations fonds / ETF
      </h2>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="grid grid-cols-2 overflow-hidden rounded-[16px] border border-white/[0.05] bg-slate-950/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
          <AssetInfoTile
            icon={<Building2 size={18} />}
            iconTone="slate"
            label="Émetteur"
            value="BlackRock"
            variant="market"
          />

          <AssetInfoTile
            icon={<Coins size={18} />}
            iconTone="green"
            label="Actifs nets"
            value="199,6 Md€"
            variant="market"
          />

          <AssetInfoTile
            icon={<Percent size={18} />}
            iconTone="cyan"
            label="Frais annuels"
            value="0,20 %"
            variant="market"
          />

          <AssetInfoTile
            icon={<Repeat2 size={18} />}
            iconTone="amber"
            label="Rotation portefeuille"
            value="0 %"
            variant="market"
          />
        </div>

        <div className="rounded-[16px] border border-white/[0.05] bg-slate-950/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Répartition sectorielle
          </h3>

          <SectorAllocationChart data={fakeSectorData} />
        </div>
      </div>
    </section>
  );
}