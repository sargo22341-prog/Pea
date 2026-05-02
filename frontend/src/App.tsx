import { Navigate, Route, Routes } from "react-router-dom";
import { Suspense, lazy } from "react";
import { Shell } from "./components/common/Shell";
import { PrivacyProvider } from "./contexts/PrivacyContext";
import { useAsync } from "./hooks/useAsync";
import { api } from "./lib/api";
import { AuthPage } from "./pages/AuthPage";

const AssetDetailPage = lazy(() => import("./pages/AssetDetailPage").then((module) => ({ default: module.AssetDetailPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const DividendsPage = lazy(() => import("./pages/DividendsPage").then((module) => ({ default: module.DividendsPage })));
const AnalysisPage = lazy(() => import("./pages/AnalysisPage").then((module) => ({ default: module.AnalysisPage })));
const NewsPage = lazy(() => import("./pages/NewsPage").then((module) => ({ default: module.NewsPage })));
const SearchPage = lazy(() => import("./pages/SearchPage").then((module) => ({ default: module.SearchPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));

function LoadingPage() {
  return <div className="p-6 text-slate-400">Chargement...</div>;
}

export function App() {
  const me = useAsync(() => api.me(), []);

  if (me.loading) return <div className="p-6 text-slate-400">Chargement...</div>;
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
          <Route path="/settings" element={<SettingsPage onUserUpdated={me.reload} />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Route>
      </Routes>
    </Suspense>
    </PrivacyProvider>
  );
}
