export type InfoTone = "positive" | "negative" | "muted" | "warning";
export type IconTone = "green" | "red" | "amber" | "sky" | "cyan" | "slate";

export function toneFromNumber(value?: number): InfoTone | undefined {
  if (value == null || !Number.isFinite(value)) return "muted";
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return undefined;
}

export function toneClass(tone?: InfoTone) {
  if (tone === "positive") return "text-mint drop-shadow-[0_0_10px_rgba(74,222,128,0.18)]";
  if (tone === "negative") return "text-coral drop-shadow-[0_0_10px_rgba(251,113,133,0.16)]";
  if (tone === "warning") return "text-amber";
  if (tone === "muted") return "text-slate-500";
  return "";
}
