import type { RuntimeHealthDto } from "@pea/shared";


export type BadgeTone = "ok" | "warning" | "error" | "neutral";
export type RuntimeT = (key: string, options?: Record<string, unknown>) => string;

export function formatNumber(value?: number) {
  return new Intl.NumberFormat("fr-FR").format(value ?? 0);
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

export function formatDuration(value?: number) {
  if (value === undefined || value === null) return "-";
  if (value < 1_000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${Math.round(value / 100) / 10} s`;
  return `${Math.round(value / 60_000)} min`;
}

export function badgeToneClass(tone: BadgeTone) {
  if (tone === "error") return "border-coral/50 bg-coral/10 text-coral";
  if (tone === "warning") return "border-amber-400/50 bg-amber-400/10 text-amber-200";
  if (tone === "ok") return "border-mint/50 bg-mint/10 text-mint";
  return "border-line bg-panel2 text-slate-300";
}

export function schedulerTone(status?: RuntimeHealthDto["scheduler"]["status"]): BadgeTone {
  if (status === "error") return "error";
  if (status === "warning") return "warning";
  if (status === "healthy") return "ok";
  return "neutral";
}

export function yahooTone(state?: RuntimeHealthDto["yahoo"]["circuitBreaker"]["state"]): BadgeTone {
  if (state === "open") return "error";
  if (state === "half-open") return "warning";
  if (state === "closed") return "ok";
  return "neutral";
}

export function failedQueueTone(failed = 0): BadgeTone {
  if (failed > 10) return "error";
  if (failed > 0) return "warning";
  return "ok";
}

export function schedulerStatusLabel(t: RuntimeT, status?: RuntimeHealthDto["scheduler"]["status"]) {
  if (status === "healthy") return t("admin.runtime.status.healthy", { ns: "common" });
  if (status === "warning") return t("admin.runtime.status.warning", { ns: "common" });
  if (status === "error") return t("admin.runtime.status.error", { ns: "common" });
  return t("admin.runtime.status.unknown", { ns: "common" });
}

export function yahooCircuitLabel(t: RuntimeT, state?: RuntimeHealthDto["yahoo"]["circuitBreaker"]["state"]) {
  if (state === "closed") return t("admin.runtime.status.closed", { ns: "common" });
  if (state === "open") return t("admin.runtime.status.open", { ns: "common" });
  if (state === "half-open") return t("admin.runtime.status.halfOpen", { ns: "common" });
  return t("admin.runtime.status.unknown", { ns: "common" });
}

export function queueTypeLabel(t: RuntimeT, type: string) {
  return t(`admin.runtime.queueTypes.${type}`, { defaultValue: type, ns: "common" });
}

export function warningBadges(data: RuntimeHealthDto | null, t: RuntimeT) {
  if (!data) return [];
  const badges: Array<{ label: string; tone: BadgeTone }> = [];
  if (data.scheduler.status !== "healthy") badges.push({ label: t("admin.runtime.schedulerWarning", { ns: "common", status: schedulerStatusLabel(t, data.scheduler.status) }), tone: schedulerTone(data.scheduler.status) });
  if (data.yahoo.circuitBreaker.state !== "closed") badges.push({ label: t("admin.runtime.yahooWarning", { ns: "common", status: yahooCircuitLabel(t, data.yahoo.circuitBreaker.state) }), tone: yahooTone(data.yahoo.circuitBreaker.state) });
  if (data.queue.failed > 0) badges.push({ label: t("admin.runtime.tasksFailed", { count: data.queue.failed, ns: "common" }), tone: failedQueueTone(data.queue.failed) });
  if ((data.queue.oldestRunningAgeMs ?? 0) > 30 * 60_000) badges.push({ label: t("admin.runtime.executionLong", { ns: "common" }), tone: "warning" });
  if (data.cache.cacheEntries.expiredRows > 1_000) badges.push({ label: t("admin.runtime.cacheExpiredHigh", { ns: "common" }), tone: "warning" });
  if (data.memory.sseClients >= 80) badges.push({ label: t("admin.runtime.sseNearLimit", { ns: "common" }), tone: "warning" });
  if (data.memory.authFailureEntries > 1_000) badges.push({ label: t("admin.runtime.authFailuresHigh", { ns: "common" }), tone: "warning" });
  return badges;
}

