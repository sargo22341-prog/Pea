import type { ReactNode } from "react";
import type { IconTone, InfoTone } from "../../../utils/assetTone";
import { iconToneClass, toneClass } from "../../../utils/assetTone";

export function AssetInfoTile({
  label,
  value,
  tone,
  icon,
  iconTone = "slate",
  variant = "tile",
  hint,
  sub
}: {
  label: string;
  value: ReactNode;
  tone?: InfoTone | undefined;
  icon?: ReactNode;
  iconTone?: IconTone;
  variant?: "tile" | "market";
  /** Explication de niveau 3 affichée à côté du libellé (`InfoHint`). */
  hint?: ReactNode;
  /** Ligne secondaire discrète sous la valeur. */
  sub?: ReactNode;
}) {
  const isMarket = variant === "market";
  return (
    <div
      className={`group/tile transition duration-200 ease-out ${
        isMarket
          ? "flex min-h-[92px] items-center gap-3 border-t border-white/[0.05] p-4 first:border-t-0 hover:bg-white/[0.02] sm:[&:nth-child(2)]:border-t-0 xl:[&:nth-child(3)]:border-t-0"
          : "rounded-[16px] border border-white/[0.05] bg-slate-950/45 p-4 shadow-[0_8px_22px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.035)] hover:border-white/[0.12] hover:bg-slate-950/60"
      }`}
    >
      {icon && (
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-transform duration-200 ease-out motion-safe:group-hover/tile:scale-110 ${iconToneClass(iconTone)}`}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400">
          <span>{label}</span>
          {hint}
        </p>
        <div className={`mt-1 break-words text-base font-semibold leading-snug ${toneClass(tone)}`}>{value}</div>
        {sub ? <div className="mt-0.5 text-xs text-slate-400">{sub}</div> : null}
      </div>
    </div>
  );
}
