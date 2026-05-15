import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMobileNavItems } from "../components/common/mobileNavItems";
import { useNativeSwipeNavigation } from "../hooks/android/useNativeSwipeNavigation";

const nativePlatform = vi.hoisted(() => ({ value: true }));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => nativePlatform.value
  }
}));

function pointer(type: string, target: EventTarget, x: number, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: x },
    clientY: { value: y },
    pointerId: { value: 1 },
    pointerType: { value: "touch" }
  });
  target.dispatchEvent(event);
}

function TestPage({ disabled = false }: { disabled?: boolean }) {
  const location = useLocation();
  const items = getMobileNavItems({ assetNewsEnabled: true });
  useNativeSwipeNavigation({ disabled, items, minDistancePx: 60, maxVerticalDeltaPx: 40 });

  return (
    <div>
      <div data-testid="path">{location.pathname}</div>
      <div data-testid="surface">surface</div>
      <input aria-label="name" />
      <div className="recharts-wrapper" data-testid="chart">chart</div>
      <div data-no-page-swipe data-testid="no-swipe">no swipe</div>
      <div data-testid="horizontal-scroll" style={{ overflowX: "auto", width: 100 }}>
        <div style={{ width: 200 }}>wide</div>
      </div>
    </div>
  );
}

function renderSwipe(path: string, options: { disabled?: boolean } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<TestPage disabled={options.disabled} />} />
      </Routes>
    </MemoryRouter>
  );
}

async function expectPath(path: string) {
  await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent(path));
}

describe("useNativeSwipeNavigation", () => {
  beforeEach(() => {
    nativePlatform.value = true;
  });

  it("navigates to the next mobile nav route on left swipe", async () => {
    renderSwipe("/");
    const surface = screen.getByTestId("surface");

    pointer("pointerdown", surface, 220, 100);
    pointer("pointerup", surface, 120, 108);

    await expectPath("/news");
  });

  it("navigates to the previous mobile nav route on right swipe", async () => {
    renderSwipe("/news");
    const surface = screen.getByTestId("surface");

    pointer("pointerdown", surface, 120, 100);
    pointer("pointerup", surface, 220, 105);

    await expectPath("/");
  });

  it("does not navigate when the current route is not in mobile nav", async () => {
    renderSwipe("/assets/AIR.PA");
    const surface = screen.getByTestId("surface");

    pointer("pointerdown", surface, 220, 100);
    pointer("pointerup", surface, 120, 100);

    await expectPath("/assets/AIR.PA");
  });

  it("does not navigate from inputs", async () => {
    renderSwipe("/");
    const input = screen.getByLabelText("name");

    pointer("pointerdown", input, 220, 100);
    pointer("pointerup", input, 120, 100);

    await expectPath("/");
  });

  it("does not navigate from charts", async () => {
    renderSwipe("/");
    const chart = screen.getByTestId("chart");

    pointer("pointerdown", chart, 220, 100);
    pointer("pointerup", chart, 120, 100);

    await expectPath("/");
  });

  it("does not navigate from data-no-page-swipe targets", async () => {
    renderSwipe("/");
    const noSwipe = screen.getByTestId("no-swipe");

    pointer("pointerdown", noSwipe, 220, 100);
    pointer("pointerup", noSwipe, 120, 100);

    await expectPath("/");
  });

  it("does not navigate from horizontally scrollable elements", async () => {
    renderSwipe("/");
    const scrollable = screen.getByTestId("horizontal-scroll");
    Object.defineProperties(scrollable, {
      clientWidth: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 200 }
    });

    pointer("pointerdown", scrollable, 220, 100);
    pointer("pointerup", scrollable, 120, 100);

    await expectPath("/");
  });

  it("does not navigate when movement is too small", async () => {
    renderSwipe("/");
    const surface = screen.getByTestId("surface");

    pointer("pointerdown", surface, 220, 100);
    pointer("pointerup", surface, 180, 100);

    await expectPath("/");
  });

  it("does not navigate when vertical movement dominates", async () => {
    renderSwipe("/");
    const surface = screen.getByTestId("surface");

    pointer("pointerdown", surface, 220, 100);
    pointer("pointerup", surface, 140, 190);

    await expectPath("/");
  });

  it("does not navigate when a modal is open", async () => {
    renderSwipe("/");
    const surface = screen.getByTestId("surface");
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    document.body.append(modal);

    try {
      pointer("pointerdown", surface, 220, 100);
      pointer("pointerup", surface, 120, 100);

      await expectPath("/");
    } finally {
      modal.remove();
    }
  });

  it("does not navigate on web/PWA", async () => {
    nativePlatform.value = false;
    renderSwipe("/");
    const surface = screen.getByTestId("surface");

    pointer("pointerdown", surface, 220, 100);
    pointer("pointerup", surface, 120, 100);

    await expectPath("/");
  });
});
