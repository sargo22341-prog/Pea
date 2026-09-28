import { useLayoutEffect, useRef } from "react";
import { cancelFrame, requestFrame } from "../../../lib/animation-frame";

/** Nombre d'images pendant lesquelles la page est maintenue en haut à l'ouverture d'un actif. */
const INITIAL_SYMBOL_FRAMES = 30;
/** Idem une fois les données reçues : les sections qui apparaissent décaleraient la page. */
const INITIAL_DATA_FRAMES = 180;

function scrollToPageTop() {
  window.scrollTo({ left: 0, top: 0, behavior: "auto" });
  document.scrollingElement?.scrollTo({ left: 0, top: 0, behavior: "auto" });
}

function keepPageAtTopForInitialPaint(frameCount: number) {
  let remainingFrames = frameCount;
  let frameHandle: number | undefined;
  let cancelled = false;

  const cancel = () => {
    cancelled = true;
    if (frameHandle !== undefined) cancelFrame(frameHandle);
  };

  const tick = () => {
    scrollToPageTop();
    remainingFrames -= 1;
    if (!cancelled && remainingFrames > 0) frameHandle = requestFrame(tick);
  };

  window.addEventListener("touchstart", cancel, { passive: true, once: true });
  window.addEventListener("wheel", cancel, { passive: true, once: true });
  window.addEventListener("pointerdown", cancel, { passive: true, once: true });
  window.addEventListener("keydown", cancel, { once: true });
  tick();

  return () => {
    cancel();
    window.removeEventListener("touchstart", cancel);
    window.removeEventListener("wheel", cancel);
    window.removeEventListener("pointerdown", cancel);
    window.removeEventListener("keydown", cancel);
  };
}

/**
 * Garde la fiche en haut de page à l'ouverture d'un actif, jusqu'à la première interaction de
 * l'utilisateur, le temps que les sections asynchrones se placent.
 */
export function useKeepPageAtTop(symbol: string, hasData: boolean) {
  const lastInitialScrollSymbolRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    lastInitialScrollSymbolRef.current = null;
    return keepPageAtTopForInitialPaint(INITIAL_SYMBOL_FRAMES);
  }, [symbol]);

  useLayoutEffect(() => {
    if (!hasData || lastInitialScrollSymbolRef.current === symbol) return;
    lastInitialScrollSymbolRef.current = symbol;
    return keepPageAtTopForInitialPaint(INITIAL_DATA_FRAMES);
  }, [hasData, symbol]);
}
