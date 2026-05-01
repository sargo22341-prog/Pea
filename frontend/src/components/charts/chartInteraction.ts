import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

export function useResponsivePieTooltip(): {
  containerRef: RefObject<HTMLDivElement | null>;
  tooltipResetKey: number;
  tooltipTrigger: "hover" | "click";
  onPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(() => (typeof window === "undefined" ? false : window.innerWidth < 768));
  const [tooltipResetKey, setTooltipResetKey] = useState(0);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!isMobile) return undefined;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) return;
      setTooltipResetKey((key) => key + 1);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isMobile]);

  const onPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMobile) return;
    const target = event.target;
    if (!(target instanceof Element) || target.tagName.toLowerCase() !== "path") {
      setTooltipResetKey((key) => key + 1);
    }
  };

  return {
    containerRef,
    tooltipResetKey,
    tooltipTrigger: isMobile ? "click" : "hover",
    onPointerDownCapture
  };
}
