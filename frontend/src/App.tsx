import { MARKET_EVENT_TYPES } from "@pea/shared";
import { Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppErrorBoundary } from "./components/common/AppErrorBoundary";
import { NavigationEffects } from "./components/common/NavigationEffects";
import { Shell } from "./components/common/Shell";
import { ServerSetupPage } from "./components/common/ServerSettings";
import { PrivacyProvider } from "./contexts/PrivacyContext";
import { useAsync } from "./hooks/useAsync";
import { api } from "./lib/api";
import { changeAppLanguage, i18n } from "./i18n";
import { lazyWithReload } from "./lib/app-loading/lazy-with-reload";
import { getNativeServerUrl, isNativeApp } from "./lib/native-auth";
import { initSystemBars, queueSystemBarsRefresh } from "./lib/system-bars";
import { FeatureFlagsContext } from "./contexts/feature-flags-context";
import { AdvancedModeContext } from "./components/common/disclosure/advanced-mode";
import { AuthPage } from "./pages/auth/AuthPage";

const AssetDetailPage = lazyWithReload(() => import("./pages/asset-detail/AssetDetailPage").then((module) => ({ default: module.AssetDetailPage })));
const DashboardPage = lazyWithReload(() => import("./pages/dashboard/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const DividendsPage = lazyWithReload(() => import("./pages/dividends/DividendsPage").then((module) => ({ default: module.DividendsPage })));
const AnalysisPage = lazyWithReload(() => import("./pages/analysis/AnalysisPage").then((module) => ({ default: module.AnalysisPage })));
const NewsPage = lazyWithReload(() => import("./pages/news/NewsPage").then((module) => ({ default: module.NewsPage })));
const ObjectivePage = lazyWithReload(() => import("./pages/objectives/ObjectivePage").then((module) => ({ default: module.ObjectivePage })));
const CalendarPage = lazyWithReload(() => import("./pages/calendar/CalendarPage").then((module) => ({ default: module.CalendarPage })));
const MarketsPage = lazyWithReload(() => import("./pages/markets/MarketsPage").then((module) => ({ default: module.MarketsPage })));
const ComparePage = lazyWithReload(() => import("./pages/compare/ComparePage").then((module) => ({ default: module.ComparePage })));
const ScreenerPage = lazyWithReload(() => import("./pages/screener/ScreenerPage").then((module) => ({ default: module.ScreenerPage })));
const AlertsPage = lazyWithReload(() => import("./pages/alerts/AlertsPage").then((module) => ({ default: module.AlertsPage })));
const SearchPage = lazyWithReload(() => import("./pages/search/SearchPage").then((module) => ({ default: module.SearchPage })));
const SettingsPage = lazyWithReload(() => import("./pages/settings/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const AdminPage = lazyWithReload(() => import("./pages/admin/AdminPage").then((module) => ({ default: module.AdminPage })));

function LoadingPage() {
  const { t } = useTranslation();
  return <div className="p-6 text-slate-400">{t("common.loading")}</div>;
}

export function App() {
  useSystemBars();
  const { t } = useTranslation(["common"]);
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

  if (nativeServerState.loading) return <div className="p-6 text-slate-400">{t("common:common.loading")}</div>;
  if (!nativeServerState.configured) {
    return <ServerSetupPage onConfigured={() => { setNativeServerState({ loading: false, configured: true }); }} />;
  }

  return <AuthenticatedApp />;
}

function useSystemBars() {
  const location = useLocation();

  useEffect(() => {
    initSystemBars();
  }, []);

  useEffect(() => {
    queueSystemBarsRefresh();
    const timeout = window.setTimeout(queueSystemBarsRefresh, 120);
    return () => { window.clearTimeout(timeout); };
  }, [location.pathname]);
}

function AuthenticatedApp() {
  const location = useLocation();
  const me = useAsync(() => api.me());
  const { t } = useTranslation(["common", "errors"]);
  const userId = me.data?.user?.id;
  const userLanguage = me.data?.user?.language;
  const marketEventsRef = useRef<ReturnType<typeof api.subscribeMarketEvents> | null>(null);

  useEffect(() => {
    if (userLanguage && i18n.language !== userLanguage) void changeAppLanguage(userLanguage);
  }, [userLanguage]);

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

  if (me.loading) return <div className="p-6 text-slate-400">{t("common:common.loading")}</div>;
  if (me.error && isNativeApp()) {
    return (
      <ServerSetupPage
        message={t("errors:serverUnreachableWithDetail", { detail: me.error })}
        onConfigured={() => { window.location.assign("/"); }}
      />
    );
  }
  if (me.data?.setupRequired) {
    return <AuthPage mode="setup" onLogin={async (input) => {
      await api.setup({ username: input.username, password: input.password, confirmPassword: input.confirmPassword ?? "", setupCode: input.setupCode ?? "" });
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
    <FeatureFlagsContext value={me.data.features}>
      {/* Mode avancé : les détails repliables de toutes les pages sont dépliés d'office. */}
      <AdvancedModeContext value={me.data.user.advancedModeEnabled}>
        <PrivacyProvider privacyEnabled={me.data.user.privacyModeEnabled}>
          <NavigationEffects />
          <AppErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<LoadingPage />}>
              <Routes>
                <Route element={<Shell user={me.data.user} />}>
                  <Route index element={<DashboardPage appTimezone={appTimezone} user={me.data.user} />} />
                  <Route path="/news" element={me.data.user.assetNewsEnabled ? <NewsPage user={me.data.user} /> : <Navigate replace to="/" />} />
                  <Route path="/analysis" element={<AnalysisPage />} />
                  <Route path="/search" element={<SearchPage user={me.data.user} />} />
                  <Route path="/dividends" element={<DividendsPage />} />
                  <Route path="/calendar" element={<CalendarPage appTimezone={appTimezone} />} />
                  <Route path="/markets" element={me.data.features.includes("markets_page") ? <MarketsPage /> : <Navigate replace to="/" />} />
                  <Route path="/compare" element={<ComparePage localPeaSearchEnabled={me.data.user.localPeaSearchEnabled} />} />
                  <Route path="/screener" element={<ScreenerPage />} />
                  <Route path="/alerts" element={me.data.features.includes("alerts") ? <AlertsPage /> : <Navigate replace to="/" />} />
                  <Route path="/objectives" element={<ObjectivePage user={me.data.user} />} />
                  <Route path="/assets/:symbol" element={<AssetDetailPage user={me.data.user} />} />
                  <Route path="/settings" element={<SettingsPage onUserUpdated={me.reload} user={me.data.user} />} />
                  <Route path="/admin" element={me.data.user.role === "admin" ? <AdminPage onFeaturesChanged={me.reload} /> : <Navigate replace to="/" />} />
                  <Route path="*" element={<Navigate replace to="/" />} />
                </Route>
              </Routes>
            </Suspense>
          </AppErrorBoundary>
        </PrivacyProvider>
      </AdvancedModeContext>
    </FeatureFlagsContext>
  );
}
