import { BookOpen, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { MOTION } from "../../../../components/common/motion";
import { usePullToRefreshSuspended } from "../../../../hooks/usePullToRefreshSuspended";
import { EffectBadge } from "./EffectBadge";
import { GuideStepContent } from "./GuideStepContent";
import { GuideStepper } from "./GuideStepper";
import { IMPORT_GUIDE_STEPS, stepEffects } from "./import-guide-steps";
import type { GuideProgress } from "./useGuideProgress";

/**
 * Fenêtre du guide des imports : une étape à la fois, barre d'étapes cliquable, flèches du
 * clavier pour avancer ou reculer, Échap pour fermer. Chaque étape affichée est marquée vue.
 */
export function ImportGuideDialog({ onClose, progress }: { onClose: () => void; progress: GuideProgress }) {
  const { t } = useTranslation("settings");
  const [current, setCurrent] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const { markSeen } = progress;
  const step = IMPORT_GUIDE_STEPS[current] ?? IMPORT_GUIDE_STEPS[0];
  const last = IMPORT_GUIDE_STEPS.length - 1;
  usePullToRefreshSuspended();

  useEffect(() => {
    markSeen(current);
    contentRef.current?.scrollTo({ top: 0 });
  }, [current, markSeen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setCurrent((index) => Math.min(index + 1, last));
      if (event.key === "ArrowLeft") setCurrent((index) => Math.max(index - 1, 0));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); };
  }, [last, onClose]);

  if (!step) return null;
  const importNumber = IMPORT_GUIDE_STEPS.slice(0, current + 1).filter((item) => item.isImport).length;

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-end bg-black/60 p-4 sm:items-center sm:justify-center ${MOTION.overlay}`} onClick={onClose} role="presentation">
      <div
        aria-labelledby="import-guide-title"
        aria-modal="true"
        className={`flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-line bg-ink/95 shadow-glow backdrop-blur ${MOTION.dialog}`}
        onClick={(event) => { event.stopPropagation(); }}
        role="dialog"
      >
        <div className="flex items-start gap-3 border-b border-line p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-sky/40 bg-sky/10 text-sky">
            <BookOpen size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="muted">{t("importGuide.title")}</p>
            <h3 className="text-base font-semibold" id="import-guide-title">
              {step.isImport ? t("importGuide.importNumber", { index: importNumber }) : null}
              {t(`importGuide.steps.${step.id}.title`)}
            </h3>
            <div className="mt-1 flex flex-wrap gap-1">
              {stepEffects(step).map((effect) => <EffectBadge effect={effect} key={effect} />)}
            </div>
          </div>
          <button aria-label={t("importGuide.close")} className="btn-ghost shrink-0 px-2" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <div className="border-b border-line px-4 pt-3">
          <GuideStepper current={current} onSelect={setCurrent} seen={progress.seen} />
        </div>
        <div className={`flex-1 overflow-y-auto p-4 ${MOTION.fadeIn}`} key={step.id} ref={contentRef}>
          <GuideStepContent step={step} />
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line p-4">
          <button className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40" disabled={current === 0} onClick={() => { setCurrent(current - 1); }} type="button">
            <ChevronLeft size={16} />
            {t("importGuide.previous")}
          </button>
          <span className="muted text-xs">{t("importGuide.position", { index: current + 1, total: IMPORT_GUIDE_STEPS.length })}</span>
          {current < last ? (
            <button className="btn-primary" onClick={() => { setCurrent(current + 1); }} type="button">
              {t("importGuide.next")}
              <ChevronRight size={16} />
            </button>
          ) : (
            <button className="btn-primary" onClick={onClose} type="button">{t("importGuide.finish")}</button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
