import { Target, TrendingUp, UsersRound } from "lucide-react";
import { money } from "../../lib/format";

export function AssetAnalystConsensus() {
    const targetPrice = 301.36;
    const currentPrice = 280.14;
    const potential = 7.57;
    const upside = 21.22;
    const analystCount = 42;
    const score = 1.88;

    const scorePosition = ((score - 1) / 4) * 100;

    return (
        <section className="w-full">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">
                Consensus des analystes et objectif de cours
            </h2>

            <div className="rounded-[14px] border border-white/[0.05] bg-slate-950/20 p-3">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                    <AnalystMetric
                        icon={<Target size={22} />}
                        label="Objectif moyen 3 mois"
                        value={money(targetPrice, "EUR")}
                        subValue={`vs. cours actuel ${money(currentPrice, "EUR")}`}
                    />

                    <AnalystMetric
                        icon={<TrendingUp size={22} />}
                        label="Potentiel"
                        value={`+${potential.toFixed(2).replace(".", ",")} %`}
                        subValue={`(+${money(upside, "EUR")} de hausse)`}
                    />

                    <AnalystMetric
                        icon={<UsersRound size={22} />}
                        label="Nombre d'analystes"
                        value={analystCount}
                        subValue="Dernière mise à jour : 01/05/2026"
                        valueClassName="text-white"
                    />

                    <div className="col-span-2 min-w-0 lg:col-span-2 lg:pl-3">
                        <p className="text-[10px] uppercase text-slate-400">
                            Recommandation consensuelle
                        </p>

                        <p className="text-base font-semibold text-mint">ACHETER</p>

                        <div className="relative mt-4">
                            <div className="h-2 rounded-full bg-gradient-to-r from-mint via-lime-400 via-yellow-300 via-orange-400 to-red-500" />

                            <div
                                className="absolute -top-6 -translate-x-1/2 rounded-md bg-emerald-600 px-2 py-[2px] text-[11px] font-semibold text-white"
                                style={{ left: `${scorePosition}%` }}
                            >
                                {score.toFixed(2).replace(".", ",")}
                            </div>

                            <div
                                className="absolute -top-1 h-0 w-0 -translate-x-1/2 border-x-3 border-t-6 border-x-transparent border-t-white"
                                style={{ left: `${scorePosition}%` }}
                            />
                        </div>

                        <div className="mt-2 grid grid-cols-5 text-center text-[9px]">
                            <div className="text-mint">
                                <p>1</p>
                                <p>Acheter fort</p>
                            </div>
                            <div className="text-lime-400">
                                <p>2</p>
                                <p>Acheter</p>
                            </div>
                            <div className="text-yellow-300">
                                <p>3</p>
                                <p>Conserver</p>
                            </div>
                            <div className="text-orange-400">
                                <p>4</p>
                                <p>Alléger</p>
                            </div>
                            <div className="text-red-400">
                                <p>5</p>
                                <p>Vendre</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

function AnalystMetric({
    icon,
    label,
    value,
    subValue,
    valueClassName = "text-mint"
}: {
    icon: React.ReactNode;
    label: string;
    value: React.ReactNode;
    subValue: React.ReactNode;
    valueClassName?: string;
}) {
    return (
        <div className="flex items-center gap-3 lg:border-r lg:border-white/[0.06] lg:pr-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-mint/25 bg-mint/10 text-mint">
                {icon}
            </div>

            <div className="min-w-0">
                <p className="text-[10px] uppercase text-slate-400">{label}</p>
                <p className={`text-base font-semibold ${valueClassName}`}>
                    {value}
                </p>
                <p className="text-[11px] text-slate-400">{subValue}</p>
            </div>
        </div>
    );
}