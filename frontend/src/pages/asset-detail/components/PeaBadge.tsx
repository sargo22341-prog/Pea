import type { PeaEligibilityStatus } from "@pea/shared";

const labels: Record<PeaEligibilityStatus, string> = {
  eligible: "PEA",
  likely_eligible: "Probablement PEA",
  unknown: "À vérifier",
  not_eligible: "Non PEA"
};

const classes: Record<PeaEligibilityStatus, string> = {
  eligible: "bg-mint/15 text-mint",
  likely_eligible: "bg-sky/15 text-sky",
  unknown: "bg-amber/15 text-amber",
  not_eligible: "bg-coral/15 text-coral"
};

export function PeaBadge({ status }: { status: PeaEligibilityStatus }) {
  return <span className={`rounded px-2 py-1 text-[11px] font-semibold ${classes[status]}`}>{labels[status]}</span>;
}
