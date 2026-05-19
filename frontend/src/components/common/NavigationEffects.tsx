import { App as NativeApp } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { isNativeApp } from "../../lib/native-auth";

function isRootPath(pathname: string) {
  return pathname === "/";
}

export function NavigationEffects() {
  useManualScrollRestoration();
  useAndroidBackNavigation();
  useScrollToTopOnPushNavigation();
  return null;
}

function useManualScrollRestoration() {
  useEffect(() => {
    if (!("scrollRestoration" in window.history)) return undefined;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);
}

function useAndroidBackNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathnameRef = useRef(location.pathname);

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    if (!isNativeApp()) return undefined;

    let active = true;
    let handle: PluginListenerHandle | undefined;

    void NativeApp.addListener("backButton", (event) => {
      if (isRootPath(pathnameRef.current)) {
        void NativeApp.exitApp();
        return;
      }

      if (event.canGoBack) {
        navigate(-1);
        return;
      }

      navigate("/", { replace: true });
    }).then((listener) => {
      if (active) {
        handle = listener;
      } else {
        void listener.remove();
      }
    });

    return () => {
      active = false;
      void handle?.remove();
    };
  }, [navigate]);
}

function useScrollToTopOnPushNavigation() {
  const location = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    if (navigationType !== "PUSH") return;

    const restoreScroll = () => {
      window.scrollTo({ left: 0, top: 0, behavior: "auto" });
      document.scrollingElement?.scrollTo({ left: 0, top: 0, behavior: "auto" });
    };
    const requestFrame = window.requestAnimationFrame ?? ((callback: FrameRequestCallback) => window.setTimeout(callback, 0));
    const cancelFrame = window.cancelAnimationFrame ?? ((handle: number) => window.clearTimeout(handle));
    let frameHandle: number | undefined;

    restoreScroll();
    frameHandle = requestFrame(() => {
      restoreScroll();
      frameHandle = requestFrame(restoreScroll);
    });

    return () => {
      if (frameHandle !== undefined) cancelFrame(frameHandle);
    };
  }, [location.key, navigationType]);
}
