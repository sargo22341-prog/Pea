import { MARKET_EVENT_TYPES } from "@pea/shared";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/common/Shell";
import { ServerSetupPage } from "./components/common/ServerSettings";
import { PrivacyProvider } from "./contexts/PrivacyContext";
import { useAsync } from "./hooks/useAsync";
import { api } from "./lib/api";
import { getNativeServerUrl, isNativeApp } from "./lib/native-auth";
import { AuthPage } from "./pages/auth/AuthPage";

const AssetDetailPage = lazy(() => import("./pages/asset-detail/AssetDetailPage").then((module) => ({ default: module.AssetDetailPage })));
const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const DividendsPage = lazy(() => import("./pages/dividends/DividendsPage").then((module) => ({ default: module.DividendsPage })));
const AnalysisPage = lazy(() => import("./pages/analysis/AnalysisPage").then((module) => ({ default: module.AnalysisPage })));
const NewsPage = lazy(() => import("./pages/news/NewsPage").then((module) => ({ default: module.NewsPage })));
const SearchPage = lazy(() => import("./pages/search/SearchPage").then((module) => ({ default: module.SearchPage })));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const AdminPage = lazy(() => import("./pages/admin/AdminPage").then((module) => ({ default: module.AdminPage })));

function LoadingPage() {
  return <div className="p-6 text-slate-400">Chargement...</div>;
}

export function App() {
  const [nativeServerState, setNativeServerState] = useState<{ loading: boolean; configured: boolean }>({
    loading: isNativeApp(),
    configured: !isNativeApp()
  });

  useEffect(() => {
    if (!isNativeApp()) return undefined;
    let active = true;
    void getNativeServerUrl().then((url) => {
      if (active) setNativeServerState({ loading: false, configured: Boolean(url) });
    });
    return () => {
      active = false;
    };
  }, []);

  if (nativeServerState.loading) return <div className="p-6 text-slate-400">Chargement...</div>;
  if (!nativeServerState.configured) {
    return <ServerSetupPage onConfigured={() => setNativeServerState({ loading: false, configured: true })} />;
  }

  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const me = useAsync(() => api.me());
  const userId = me.data?.user?.id;
  const marketEventsRef = useRef<ReturnType<typeof api.subscribeMarketEvents> | null>(null);

  useEffect(() => {
    if (!userId) return undefined;

    function connect() {
      if (marketEventsRef.current) return;
      const marketEvents = api.subscribeMarketEvents((_eventName, payload) => {
        window.dispatchEvent(new CustomEvent("pea:market-event", { detail: payload }));
      });
      marketEventsRef.current = marketEvents;
      for (const eventName of MARKET_EVENT_TYPES) {
        marketEvents.addEventListener(eventName);
      }
    }

    function reconnectWhenForegrounded() {
      if (document.visibilityState !== "visible") return;
      connect();
    }

    connect();
    document.addEventListener("visibilitychange", reconnectWhenForegrounded);
    window.addEventListener("focus", reconnectWhenForegrounded);

    return () => {
      document.removeEventListener("visibilitychange", reconnectWhenForegrounded);
      window.removeEventListener("focus", reconnectWhenForegrounded);
      marketEventsRef.current?.close();
      marketEventsRef.current = null;
    };
  }, [userId]);

  if (me.loading) return <div className="p-6 text-slate-400">Chargement...</div>;
  if (me.error && isNativeApp()) {
    return (
      <ServerSetupPage
        message={`Serveur inaccessible ou invalide. Detail : ${me.error}`}
        onConfigured={() => window.location.assign("/")}
      />
    );
  }
  if (me.data?.setupRequired) {
    return <AuthPage mode="setup" onLogin={async (input) => {
      await api.setup({ username: input.username, password: input.password, confirmPassword: input.confirmPassword ?? "" });
      await me.reload();
    }} />;
  }
  if (!me.data?.user) {
    return <AuthPage mode="login" onLogin={async (input) => {
      await api.login({ username: input.username, password: input.password });
      await me.reload();
    }} />;
  }
  const appTimezone = me.data.appTimezone;

  return (
    <PrivacyProvider privacyEnabled={me.data.user.privacyModeEnabled}>
    <Suspense fallback={<LoadingPage />}>
      <Routes>
        <Route element={<Shell user={me.data.user} />}>
          <Route index element={<DashboardPage appTimezone={appTimezone} user={me.data.user} />} />
          <Route path="/news" element={me.data.user.assetNewsEnabled ? <NewsPage user={me.data.user} /> : <Navigate replace to="/" />} />
          <Route path="/portfolio" element={<Navigate replace to="/news" />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/dividends" element={<DividendsPage />} />
          <Route path="/assets/:symbol" element={<AssetDetailPage user={me.data.user} />} />
          <Route path="/settings" element={<SettingsPage onUserUpdated={me.reload} user={me.data.user} />} />
          <Route path="/admin" element={me.data.user.role === "admin" ? <AdminPage /> : <Navigate replace to="/" />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Route>
      </Routes>
    </Suspense>
    </PrivacyProvider>
  );
}
