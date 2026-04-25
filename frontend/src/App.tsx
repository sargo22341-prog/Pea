import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { useAsync } from "./hooks/useAsync";
import { api } from "./lib/api";
import { AssetDetailPage } from "./pages/AssetDetailPage";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DividendsPage } from "./pages/DividendsPage";
import { PortfolioPage } from "./pages/PortfolioPage";
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

  return (
    <Routes>
      <Route element={<Shell user={me.data.user} onLogout={me.reload} />}>
        <Route index element={<DashboardPage user={me.data.user} />} />
        <Route path="/portfolio" element={<PortfolioPage user={me.data.user} />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/dividends" element={<DividendsPage />} />
        <Route path="/assets/:symbol" element={<AssetDetailPage user={me.data.user} />} />
        <Route path="/settings" element={<SettingsPage onUserUpdated={me.reload} />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  );
}
