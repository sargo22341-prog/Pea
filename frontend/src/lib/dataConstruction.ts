import type { DataConstructionJobDto } from "@pea/shared";

export const dataConstructionChangedEvent = "pea:data-construction-changed";

type DataConstructionStatus = DataConstructionJobDto["status"] | "pending" | "failed" | "completed";
type MaybeConstructionJob = Pick<DataConstructionJobDto, "id" | "totalTasks">;

export function isDataConstructionActive(job?: DataConstructionJobDto | null) {
  if (!job) return false;
  const status = job.status as DataConstructionStatus;
  return status === "pending" || status === "running" || job.pendingTasks > 0;
}

export function hasDataConstructionJob(job?: MaybeConstructionJob | null) {
  return Boolean(job && job.id !== "idle" && job.totalTasks > 0);
}

export function notifyDataConstructionChanged(job?: DataConstructionJobDto) {
  window.dispatchEvent(new CustomEvent<DataConstructionJobDto | undefined>(dataConstructionChangedEvent, { detail: job }));
}
