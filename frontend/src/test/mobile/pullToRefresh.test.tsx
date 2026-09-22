import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";
import { resetPullToRefreshSuspensions, suspendPullToRefresh } from "../../lib/pull-to-refresh";
import { usePullToRefreshSuspended } from "../../hooks/usePullToRefreshSuspended";

const setEnabled = vi.fn().mockResolvedValue(undefined);

vi.mock("@capacitor/core", async () => {
  const actual = await vi.importActual<typeof import("@capacitor/core")>("@capacitor/core");
  return {
    ...actual,
    Capacitor: { ...actual.Capacitor, isNativePlatform: vi.fn(() => true), getPlatform: vi.fn(() => "android") },
    registerPlugin: () => ({ setEnabled: (options: { enabled: boolean }) => setEnabled(options) })
  };
});

function Modal() {
  usePullToRefreshSuspended();
  return <div>modal</div>;
}

beforeEach(() => {
  resetPullToRefreshSuspensions();
  setEnabled.mockClear();
});

afterEach(() => {
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
});

describe("suspendPullToRefresh", () => {
  it("only re-enables the native gesture once every suspension is released", () => {
    const releaseFirst = suspendPullToRefresh();
    const releaseSecond = suspendPullToRefresh();
    expect(setEnabled.mock.calls).toEqual([[{ enabled: false }]]);

    releaseFirst();
    expect(setEnabled.mock.calls).toEqual([[{ enabled: false }]]);

    releaseSecond();
    expect(setEnabled.mock.calls).toEqual([[{ enabled: false }], [{ enabled: true }]]);
  });

  it("ignores a release called twice so the gesture stays suspended for the remaining modal", () => {
    const release = suspendPullToRefresh();
    suspendPullToRefresh();

    release();
    release();

    expect(setEnabled.mock.calls).toEqual([[{ enabled: false }]]);
  });

  it("never talks to the native plugin outside the Android application", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    suspendPullToRefresh()();

    expect(setEnabled).not.toHaveBeenCalled();
  });
});

describe("usePullToRefreshSuspended", () => {
  it("suspends the gesture while a modal is mounted and restores it on unmount", () => {
    const view = render(<Modal />);
    expect(setEnabled).toHaveBeenLastCalledWith({ enabled: false });

    view.unmount();
    expect(setEnabled).toHaveBeenLastCalledWith({ enabled: true });
  });
});
