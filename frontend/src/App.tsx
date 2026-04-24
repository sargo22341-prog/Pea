import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { AssetDetailPage } from "./pages/AssetDetailPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DividendsPage } from "./pages/DividendsPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { SearchPage } from "./pages/SearchPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<DashboardPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/dividends" element={<DividendsPage />} />
        <Route path="/assets/:symbol" element={<AssetDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  );
}
