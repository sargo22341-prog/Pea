import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/api";

type Listener = (event: { data: string }) => void;

class TestEventSource {
  static instances: TestEventSource[] = [];
  onerror?: () => void;
  onopen?: () => void;
  addEventListener = vi.fn<(eventName: string, listener: Listener) => void>();
  close = vi.fn();

  constructor(public url: string, public init?: EventSourceInit) {
    TestEventSource.instances.push(this);
  }
}

describe("market events subscription", () => {
  afterEach(() => {
    TestEventSource.instances = [];
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("registers each event once and ignores unreadable payloads without breaking the stream", () => {
    vi.stubGlobal("EventSource", TestEventSource);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const received: unknown[] = [];

    const subscription = api.subscribeMarketEvents((_eventName, payload) => received.push(payload));
    subscription.addEventListener("portfolio-chart-updated");
    subscription.addEventListener("portfolio-chart-updated");

    const [source] = TestEventSource.instances;
    expect(source.addEventListener).toHaveBeenCalledTimes(1);
    const listener = source.addEventListener.mock.calls[0][1];

    expect(() => listener({ data: "{not-json" })).not.toThrow();
    listener({ data: JSON.stringify({ type: "portfolio-chart-updated" }) });

    expect(received).toEqual([{ type: "portfolio-chart-updated" }]);
    expect(warn).toHaveBeenCalledTimes(1);
    subscription.close();
  });
});
