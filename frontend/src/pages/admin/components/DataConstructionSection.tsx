import { Activity } from "lucide-react";
import { useEffect, useState } from "react";
import type { DataConstructionJobDto } from "@pea/shared";
import { api } from "../../../lib/api";
import { dataConstructionChangedEvent, isDataConstructionActive } from "../../../lib/dataConstruction";

export function DataConstructionSection() {
  const [job, setJob] = useState<DataConstructionJobDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let loading = false;

    function clearTimer() {
      if (timer) window.clearTimeout(timer);
      timer = undefined;
    }

    async function load() {
      if (loading) return;
      loading = true;
      try {
        const status = await api.dataConstructionStatus();
        if (cancelled) return;
        if (isDataConstructionActive(status)) {
          setJob(status);
          clearTimer();
          timer = window.setTimeout(load, 2000);
        } else {
          setJob(null);
          clearTimer();
        }
      } catch {
        if (!cancelled) {
          setJob(null);
          clearTimer();
        }
      } finally {
        loading = false;
      }
    }

    function startPolling(event?: Event) {
      const nextJob = event instanceof CustomEvent ? (event.detail as DataConstructionJobDto | undefined) : undefined;
      if (nextJob && isDataConstructionActive(nextJob)) setJob(nextJob);
      clearTimer();
      void load();
    }

    void load();
    window.addEventListener(dataConstructionChangedEvent, startPolling);
    return () => {
      cancelled = true;
      clearTimer();
      window.removeEventListener(dataConstructionChangedEvent, startPolling);
    };
  }, []);

  const status = job?.status ?? "idle";
  const progress = job?.progressPercent ?? 100;
  const completed = job?.completedTasks ?? 0;
  const total = job?.totalTasks ?? 0;
  const failed = job?.failedTasks ?? 0;

  if (!isDataConstructionActive(job)) return null;

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="text-sky" size={20} />
          <h2 className="font-semibold">Construction des donnees</h2>
        </div>
        <span className="text-sm text-slate-400">{completed + failed} / {total}</span>
      </div>

      <div className="h-2 overflow-hidden rounded bg-panel2">
        <div className="h-full bg-sky transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-3 flex flex-col gap-1 text-sm text-slate-400">
        <p>Statut: {status}</p>
        {job?.currentTaskLabel ? <p>Tache courante: {job.currentTaskLabel}</p> : null}
        <p>{job?.currentMessage ?? "Aucune construction en cours"}</p>
        {job?.errors?.length ? (
          <ul className="space-y-1 text-coral">
            {job.errors.slice(-3).map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
