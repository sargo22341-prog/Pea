import { memo, type ReactElement, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ResponsiveContainer } from "recharts";

type ContainerSize = {
  height: number;
  width: number;
};

const RESIZE_DEBOUNCE_MS = 80;

/**
 * Wrapper Recharts qui :
 *   - mesure les dimensions réelles via `ResizeObserver` (Recharts ne gère pas bien les
 *     containers à hauteur dynamique en SSR / animations CSS) ;
 *   - debounce la mise à jour pour éviter une cascade de re-renders pendant un resize fluide
 *     (animations, drag, redimensionnement fenêtre) ;
 *   - mémoïse l'objet `size` pour stabiliser la prop `initialDimension` que Recharts utilise
 *     comme dépendance interne.
 *
 * Memo sur le composant entier : un parent qui se re-render avec les mêmes children ne
 * déclenche pas un remount des charts.
 */
function SafeResponsiveContainerInner({ children }: { children: ReactElement }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ContainerSize | null>(null);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;

    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    let lastEmitted: ContainerSize | null = null;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      const next: ContainerSize = { height: Math.round(rect.height), width: Math.round(rect.width) };
      if (next.width <= 0 || next.height <= 0) return;
      if (lastEmitted && lastEmitted.width === next.width && lastEmitted.height === next.height) return;
      lastEmitted = next;
      setSize(next);
    };

    const scheduleMeasure = () => {
      if (pendingTimer != null) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(measure, RESIZE_DEBOUNCE_MS);
    };

    // Première mesure synchrone : on a besoin d'une taille immédiatement pour rendre.
    measure();

    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (pendingTimer != null) clearTimeout(pendingTimer);
    };
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || !size) return undefined;

    function dismissTooltip(e: PointerEvent) {
      if (!node!.contains(e.target as Node)) {
        const wrapper = node!.querySelector(".recharts-wrapper");
        if (wrapper) {
          wrapper.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true, cancelable: true }));
        }
      }
    }

    document.addEventListener("pointerdown", dismissTooltip);
    return () => document.removeEventListener("pointerdown", dismissTooltip);
  }, [size]);

  // Stabilise l'objet size pour Recharts : grâce au check `lastEmitted` dans le ResizeObserver,
  // on n'appelle `setSize` que si width/height changent vraiment, donc l'identité de `size`
  // est déjà stable au sens fonctionnel. Le useMemo est devenu redondant.
  const stableSize = size;

  return (
    <div className="h-full min-h-px w-full min-w-0" ref={containerRef}>
      {stableSize ? (
        <ResponsiveContainer height="100%" initialDimension={stableSize} minHeight={1} minWidth={1} width="100%">
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

export const SafeResponsiveContainer = memo(SafeResponsiveContainerInner);
