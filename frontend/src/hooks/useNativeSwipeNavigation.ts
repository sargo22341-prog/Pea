import { Capacitor } from "@capacitor/core";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { MobileNavItem } from "../components/common/mobileNavItems";

type SwipeNavigationOptions = {
  disabled?: boolean;
  maxVerticalDeltaPx?: number;
  minDistancePx?: number;
  items: MobileNavItem[];
};

type SwipePoint = {
  pointerId: number;
  target: EventTarget | null;
  x: number;
  y: number;
};

const defaultMinDistancePx = 70;
const defaultMaxVerticalDeltaPx = 40;

function elementFrom(target: EventTarget | null) {
  return target instanceof Element ? target : null;
}

function hasScrollableHorizontalAncestor(element: Element | null) {
  let current: Element | null = element;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const overflowX = style.overflowX;
    const canScroll = current.scrollWidth > current.clientWidth;
    if (canScroll && (overflowX === "auto" || overflowX === "scroll")) return true;
    current = current.parentElement;
  }
  return false;
}

function isModalOpen() {
  return Boolean(document.querySelector("[aria-modal='true'], [role='dialog'], dialog[open]"));
}

export function isInteractiveElement(target: EventTarget | null) {
  const element = elementFrom(target);
  if (!element) return false;
  if (
    element.closest(
      "input, textarea, select, button, a, [role='button'], [data-no-page-swipe], .recharts-wrapper"
    )
  ) {
    return true;
  }
  return hasScrollableHorizontalAncestor(element);
}

export function useNativeSwipeNavigation({
  disabled = false,
  items,
  maxVerticalDeltaPx = defaultMaxVerticalDeltaPx,
  minDistancePx = defaultMinDistancePx
}: SwipeNavigationOptions) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (disabled || !Capacitor.isNativePlatform()) return undefined;

    let start: SwipePoint | undefined;

    const currentIndex = () => items.findIndex((item) => item.path === location.pathname);

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "touch") return;
      if (isModalOpen() || isInteractiveElement(event.target)) {
        start = undefined;
        return;
      }
      if (currentIndex() === -1) return;
      start = {
        pointerId: event.pointerId,
        target: event.target,
        x: event.clientX,
        y: event.clientY
      };
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.pointerId) return;
      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      const originTarget = start.target;
      start = undefined;

      if (isModalOpen() || isInteractiveElement(originTarget) || isInteractiveElement(event.target)) return;
      if (Math.abs(deltaX) < minDistancePx) return;
      if (Math.abs(deltaY) > maxVerticalDeltaPx || Math.abs(deltaY) > Math.abs(deltaX)) return;

      const index = currentIndex();
      if (index === -1) return;

      const nextIndex = deltaX < 0 ? index + 1 : index - 1;
      const nextItem = items[nextIndex];
      if (!nextItem) return;

      navigate(nextItem.path);
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (start?.pointerId === event.pointerId) start = undefined;
    };

    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerCancel, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [disabled, items, location.pathname, maxVerticalDeltaPx, minDistancePx, navigate]);
}
