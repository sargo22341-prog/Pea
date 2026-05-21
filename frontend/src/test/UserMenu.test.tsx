import type { User } from "@pea/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Shell } from "../components/common/Shell";
import { SettingsPage } from "../pages/settings/SettingsPage";

vi.mock("../components/common/ServerSettings", () => ({
  ServerSettingsSection: () => <section>Server settings</section>
}));

vi.mock("../pages/settings/components/AccountSettingsSection", () => ({
  AccountSettingsSection: () => <section>Account settings</section>
}));

vi.mock("../pages/settings/components/UserPreferencesSection", () => ({
  UserPreferencesSection: () => <section>User preferences</section>
}));

vi.mock("../pages/settings/components/AssetIconsSettingsSection", () => ({
  AssetIconsSettingsSection: () => <section>Asset icons</section>
}));

vi.mock("../pages/settings/components/CsvImportSection", () => ({
  CsvImportSection: () => <section>CSV import</section>
}));

vi.mock("../pages/settings/components/ImportAvisOperesPdf", () => ({
  ImportAvisOperesPdf: () => <section>PDF import</section>
}));

const baseUser: User = {
  id: 1,
  username: "alice",
  role: "user",
  defaultChartRange: "1d",
  projectionEndAge: 90,
  assetNewsEnabled: true,
  localPeaSearchEnabled: true,
  newsLanguages: ["fr"],
  language: "fr",
  dashboardDefaultSortKey: "name",
  dashboardDefaultSortDirection: "asc",
  watchlistDefaultSortKey: "name",
  watchlistDefaultSortDirection: "asc",
  privacyModeEnabled: false,
  hasProfileIcon: false,
  createdAt: "2026-05-21T00:00:00.000Z"
};

function renderShell(user: User) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route element={<Shell user={user} />}>
          <Route index element={<div>Home</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("UserMenu", () => {
  it("shows objectives and settings from the user icon", async () => {
    const user = userEvent.setup();
    renderShell(baseUser);

    await user.click(screen.getAllByRole("button", { name: "Menu utilisateur" })[0]);

    expect(screen.getByRole("menuitem", { name: /objectif/i })).toHaveAttribute("href", "/objectives");
    expect(screen.getByRole("menuitem", { name: /parametres/i })).toHaveAttribute("href", "/settings");
  });

  it("shows server administration only for admins", async () => {
    const user = userEvent.setup();
    const { unmount } = renderShell({ ...baseUser, role: "user" });

    await user.click(screen.getAllByRole("button", { name: "Menu utilisateur" })[0]);
    expect(screen.queryByRole("menuitem", { name: /administration serveur/i })).not.toBeInTheDocument();

    unmount();
    renderShell({ ...baseUser, role: "admin" });

    await user.click(screen.getAllByRole("button", { name: "Menu utilisateur" })[0]);
    expect(screen.getByRole("menuitem", { name: /administration serveur/i })).toHaveAttribute("href", "/admin");
  });

  it("does not show the server administration button in settings anymore", () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    expect(screen.queryByRole("link", { name: /administration serveur/i })).not.toBeInTheDocument();
  });
});
