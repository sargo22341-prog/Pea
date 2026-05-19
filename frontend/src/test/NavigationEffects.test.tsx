import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NavigationEffects } from "../components/common/NavigationEffects";

const nativeMocks = vi.hoisted(() => ({
  addListener: vi.fn(),
  backHandler: undefined as undefined | ((event: { canGoBack: boolean }) => void),
  exitApp: vi.fn(),
  isNativeApp: vi.fn(),
  remove: vi.fn()
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: nativeMocks.addListener,
    exitApp: nativeMocks.exitApp
  }
}));

vi.mock("../lib/native-auth", () => ({
  isNativeApp: nativeMocks.isNativeApp
}));

function TestRoutes() {
  return (
    <>
      <NavigationEffects />
      <Routes>
        <Route index element={<Home />} />
        <Route path="/assets/:symbol" element={<Page label="Asset" />} />
      </Routes>
    </>
  );
}

function Home() {
  return (
    <div>
      <h1>Home</h1>
      <Link to="/assets/ASML.AS">Open asset</Link>
    </div>
  );
}

function Page({ label }: { label: string }) {
  const location = useLocation();
  return (
    <div>
      <h1>{label}</h1>
      <p>{location.pathname}</p>
    </div>
  );
}

describe("NavigationEffects", () => {
  beforeEach(() => {
    nativeMocks.addListener.mockReset();
    nativeMocks.backHandler = undefined;
    nativeMocks.exitApp.mockReset();
    nativeMocks.isNativeApp.mockReset();
    nativeMocks.remove.mockReset();
    nativeMocks.addListener.mockImplementation(async (_eventName, handler) => {
      nativeMocks.backHandler = handler;
      return { remove: nativeMocks.remove };
    });
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn()
    });
  });

  it("scrolls to the top for route pushes", async () => {
    nativeMocks.isNativeApp.mockReturnValue(false);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <TestRoutes />
      </MemoryRouter>
    );

    expect(window.scrollTo).not.toHaveBeenCalled();
    await user.click(screen.getByRole("link", { name: /open asset/i }));

    expect(await screen.findByText("Asset")).toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenCalledWith({ left: 0, top: 0, behavior: "auto" });
  });

  it("navigates back inside the app when Android back has history", async () => {
    nativeMocks.isNativeApp.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={["/", "/assets/ASML.AS"]} initialIndex={1}>
        <TestRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText("Asset")).toBeInTheDocument();
    await waitFor(() => expect(nativeMocks.backHandler).toBeDefined());
    await act(async () => {
      nativeMocks.backHandler?.({ canGoBack: true });
    });

    expect(await screen.findByText("Home")).toBeInTheDocument();
    expect(nativeMocks.exitApp).not.toHaveBeenCalled();
  });

  it("returns to home from a direct internal route when Android reports no browser history", async () => {
    nativeMocks.isNativeApp.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={["/assets/ASML.AS"]}>
        <TestRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText("Asset")).toBeInTheDocument();
    await waitFor(() => expect(nativeMocks.backHandler).toBeDefined());
    await act(async () => {
      nativeMocks.backHandler?.({ canGoBack: false });
    });

    expect(await screen.findByText("Home")).toBeInTheDocument();
    expect(nativeMocks.exitApp).not.toHaveBeenCalled();
  });

  it("exits the Android app only from the navigation root", async () => {
    nativeMocks.isNativeApp.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <TestRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText("Home")).toBeInTheDocument();
    await waitFor(() => expect(nativeMocks.backHandler).toBeDefined());
    await act(async () => {
      nativeMocks.backHandler?.({ canGoBack: true });
    });

    expect(nativeMocks.exitApp).toHaveBeenCalledTimes(1);
  });
});
