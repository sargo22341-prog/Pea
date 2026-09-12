import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useNumberPulse, useTogglePulse } from "../../pages/asset-detail/hooks/useValuePulse";

describe("useNumberPulse", () => {
  it("n'annonce aucune variation au premier rendu", () => {
    const { result } = renderHook(() => useNumberPulse(100));

    expect(result.current).toEqual({ pulseKey: 0, trend: "none" });
  });

  it("distingue une hausse d'une baisse", () => {
    const { rerender, result } = renderHook(({ price }) => useNumberPulse(price), { initialProps: { price: 100 } });

    act(() => rerender({ price: 120 }));
    expect(result.current).toEqual({ pulseKey: 1, trend: "up" });

    act(() => rerender({ price: 90 }));
    expect(result.current).toEqual({ pulseKey: 2, trend: "down" });
  });

  it("ne pulse pas quand la valeur est identique ou inexploitable", () => {
    const { rerender, result } = renderHook(({ price }: { price: number | undefined }) => useNumberPulse(price), {
      initialProps: { price: 100 as number | undefined }
    });

    act(() => rerender({ price: 100 }));
    act(() => rerender({ price: undefined }));
    act(() => rerender({ price: Number.NaN }));

    expect(result.current.pulseKey).toBe(0);
  });
});

describe("useTogglePulse", () => {
  it("compte chaque bascule sans pulser au premier rendu", () => {
    const { rerender, result } = renderHook(({ active }) => useTogglePulse(active), { initialProps: { active: false } });

    expect(result.current).toBe(0);

    act(() => rerender({ active: true }));
    expect(result.current).toBe(1);

    act(() => rerender({ active: true }));
    expect(result.current).toBe(1);

    act(() => rerender({ active: false }));
    expect(result.current).toBe(2);
  });
});
