/**
 * Role du fichier : fournir une tuile libelle/valeur reutilisee dans les blocs
 * d'informations de la page detail d'un actif.
 */

import type { ReactNode } from "react";
import type { IconTone, InfoTone } from "../../../utils/assetTone";
import { toneClass } from "../../../utils/assetTone";

export function AssetInfoTile({
  label,
  value,
  tone,
  icon,
  iconTone = "slate",
  variant = "tile"
}: {
  label: string;
  value: ReactNode;
  tone?: InfoTone;
  icon?: ReactNode;
  iconTone?: IconTone;
  variant?: "tile" | "market";
}) {
  const isMarket = variant === "market";
  return (
    <div
      className={
        isMarket
          ? "flex min-h-[92px] items-center gap-3 border-t border-white/[0.05] p-4 first:border-t-0 sm:[&:nth-child(2)]:border-t-0 xl:[&:nth-child(3)]:border-t-0"
          : "rounded-[16px] border border-white/[0.05] bg-slate-950/45 p-4 shadow-[0_8px_22px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.035)]"
      }
    >
      {icon && (
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${iconToneClass(iconTone)}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <div className={`mt-1 break-words text-base font-semibold leading-snug ${toneClass(tone)}`}>{value}</div>
      </div>
    </div>
  );
}

function iconToneClass(tone: IconTone) {
  if (tone === "green") return "border-mint/25 bg-mint/10 text-mint shadow-[0_0_18px_rgba(74,222,128,0.18)]";
  if (tone === "red") return "border-coral/25 bg-coral/10 text-coral shadow-[0_0_18px_rgba(251,113,133,0.16)]";
  if (tone === "amber") return "border-amber/25 bg-amber/10 text-amber shadow-[0_0_18px_rgba(251,191,36,0.15)]";
  if (tone === "sky") return "border-sky/25 bg-sky/10 text-sky shadow-[0_0_18px_rgba(56,189,248,0.16)]";
  if (tone === "cyan") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.14)]";
  return "border-white/[0.08] bg-white/[0.04] text-slate-300";
}
