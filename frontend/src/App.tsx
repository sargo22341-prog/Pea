import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/common/Shell";
import { useAsync } from "./hooks/useAsync";
import { api } from "./lib/api";
import { AssetDetailPage } from "./pages/AssetDetailPage";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DividendsPage } from "./pages/DividendsPage";
import { AnalysisPage } from "./pages/AnalysisPage";
import { NewsPage } from "./pages/NewsPage";
import { SearchPage } from "./pages/SearchPage";
import { SettingsPage } from "./pages/SettingsPage";

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
  );
}
