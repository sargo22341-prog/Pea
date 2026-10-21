import type { ReactNode } from "react";

/** Gabarit commun des illustrations : 320 × 150, adaptatif, masqué des lecteurs d'écran (le texte suit). */
export function IllustrationFrame({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden className="mx-auto h-auto w-full max-w-md" focusable="false" viewBox="0 0 320 150" xmlns="http://www.w3.org/2000/svg">
      {children}
    </svg>
  );
}

/** Feuille de document avec coin replié et étiquette d'en-tête (« PDF », « CSV »). */
export function DocSheet({ x, y, width, height, tag }: { x: number; y: number; width: number; height: number; tag: string }) {
  const fold = 12;
  return (
    <g>
      <path className="fill-panel2 stroke-line" d={`M${x} ${y} h${width - fold} l${fold} ${fold} v${height - fold} h-${width} z`} strokeWidth={1.5} />
      <path className="fill-line" d={`M${x + width - fold} ${y} v${fold} h${fold} z`} />
      <rect className="fill-coral/20" height={12} rx={2} width={26} x={x + 8} y={y + 8} />
      <text className="fill-coral text-[8px] font-semibold" x={x + 12} y={y + 17}>{tag}</text>
    </g>
  );
}

/** Ligne de texte stylisée (barre grise) dans un document. */
export function TextBar({ x, y, width, tone = "fill-slate-600" }: { x: number; y: number; width: number; tone?: string }) {
  return <rect className={tone} height={5} rx={2.5} width={width} x={x} y={y} />;
}

/** Flèche horizontale du document vers l'application. */
export function FlowArrow({ x, y, length = 30 }: { x: number; y: number; length?: number }) {
  return (
    <g className="stroke-slate-500" fill="none" strokeLinecap="round" strokeWidth={1.5}>
      <path d={`M${x} ${y} h${length}`} strokeDasharray="3 3" />
      <path d={`M${x + length - 5} ${y - 4} l5 4 l-5 4`} />
    </g>
  );
}

/** Carte « dans l'application » : titre et pastille d'effet colorée. */
export function AppCard({ x, y, title, badge, tone }: { x: number; y: number; title: string; badge: string; tone: "mint" | "sky" | "violet" | "amber" }) {
  const tones = {
    mint: ["fill-mint/15 stroke-mint/50", "fill-mint"],
    sky: ["fill-sky/15 stroke-sky/50", "fill-sky"],
    violet: ["fill-violet-400/15 stroke-violet-400/50", "fill-violet-300"],
    amber: ["fill-amber/15 stroke-amber/50", "fill-amber"]
  } as const;
  const [box, text] = tones[tone];
  return (
    <g>
      <rect className="fill-panel stroke-line" height={58} rx={8} strokeWidth={1.5} width={100} x={x} y={y} />
      <text className="fill-slate-200 text-[9px] font-semibold" x={x + 10} y={y + 18}>{title}</text>
      <rect className={box} height={18} rx={9} strokeWidth={1} width={84} x={x + 8} y={y + 30} />
      <text className={`${text} text-[8px] font-semibold`} textAnchor="middle" x={x + 50} y={y + 42}>{badge}</text>
    </g>
  );
}
