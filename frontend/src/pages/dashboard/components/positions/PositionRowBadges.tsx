import type { PositionConsensusChange } from "@pea/shared";
import { Split } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MOTION } from "../../../../components/common/motion";
import { formatMaybeDate } from "../../../../lib/format";
import { recommendationLabelKey } from "../../../../utils/assetTone";

/** Pastilles d'une ligne de position : données partielles, division d'action à valider, changement de consensus. */
export function PositionRowBadges({ incompleteData, pendingSplit, consensusChange, compact = false }: {
  incompleteData?: boolean | undefined;
  pendingSplit: boolean;
  consensusChange?: PositionConsensusChange | undefined;
  compact?: boolean;
}) {
  const { t } = useTranslation(["dashboard", "asset"]);

  return (
    <>
      {incompleteData && !compact ? (
        <span className="rounded bg-amber/15 px-2 py-1 text-[11px] font-semibold text-amber">{t("positionRows.partial", { ns: "dashboard" })}</span>
      ) : null}
      {pendingSplit ? (
        <span
          className={`inline-flex items-center gap-1 rounded bg-amber/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber ${MOTION.pop}`}
          title={t("splits.pendingBadge", { ns: "asset" })}
        >
          <Split aria-hidden size={12} />
          {compact ? <span className="sr-only">{t("splits.pendingBadge", { ns: "asset" })}</span> : t("splits.pendingBadge", { ns: "asset" })}
        </span>
      ) : null}
      {consensusChange ? <ConsensusChangeDot change={consensusChange} /> : null}
    </>
  );
}

/** Point ambre discret : la recommandation consensuelle des analystes a changé récemment. */
function ConsensusChangeDot({ change }: { change: PositionConsensusChange }) {
  const { t } = useTranslation(["dashboard", "asset"]);
  const label = t("positionSignals.consensusChanged", {
    ns: "dashboard",
    from: t(recommendationLabelKey(change.from), { ns: "asset" }),
    to: t(recommendationLabelKey(change.to), { ns: "asset" }),
    date: formatMaybeDate(change.changedAt)
  });
  return (
    <span aria-label={label} className={`inline-flex h-4 w-4 shrink-0 items-center justify-center ${MOTION.pop}`} role="img" title={label}>
      <span aria-hidden className="h-2 w-2 rounded-full bg-amber shadow-[0_0_10px_rgba(251,191,36,0.55)]" />
    </span>
  );
}
