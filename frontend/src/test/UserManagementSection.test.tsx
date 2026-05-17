import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminManagedUser } from "@pea/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserManagementSection } from "../pages/admin/components/UserManagementSection";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: {
    adminUsers: vi.fn(),
    createAdminUser: vi.fn(),
    deleteAdminUser: vi.fn()
  }
}));

const adminUser: AdminManagedUser = {
  id: 1,
  username: "alice",
  role: "admin",
  createdAt: "2026-05-14T12:00:00.000Z",
  isProtectedAdmin: true
};

const standardUser: AdminManagedUser = {
  id: 2,
  username: "bob",
  role: "user",
  createdAt: "2026-05-14T13:00:00.000Z",
  isProtectedAdmin: false
};

function openManagerUsers() {
  fireEvent.click(screen.getByRole("button", { name: /manager users/i }));
}

describe("UserManagementSection", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("affiche les utilisateurs sans exposer de mot de passe", async () => {
    vi.mocked(api.adminUsers).mockResolvedValue([adminUser, standardUser]);

    render(<UserManagementSection />);

    expect(screen.queryByText("alice")).not.toBeInTheDocument();
    openManagerUsers();
    expect(await screen.findByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
    expect(screen.getByText("Protege")).toBeInTheDocument();
    expect(screen.queryByText(/password/i)).not.toBeInTheDocument();
  });

  it("cree un utilisateur standard", async () => {
    const user = userEvent.setup();
    vi.mocked(api.adminUsers).mockResolvedValue([adminUser]);
    vi.mocked(api.createAdminUser).mockResolvedValue(standardUser);

    render(<UserManagementSection />);

    openManagerUsers();
    await screen.findByText("alice");
    await user.type(screen.getByLabelText(/username/i), "bob");
    await user.type(screen.getByLabelText(/mot de passe/i), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: /ajouter/i }));

    await waitFor(() => expect(api.createAdminUser).toHaveBeenCalledWith({ username: "bob", password: "correct horse battery staple" }));
    expect(await screen.findByText("bob")).toBeInTheDocument();
    expect(screen.getByText("bob ajoute comme utilisateur standard.")).toBeInTheDocument();
  });

  it("supprime un utilisateur standard apres confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(api.adminUsers).mockResolvedValue([adminUser, standardUser]);
    vi.mocked(api.deleteAdminUser).mockResolvedValue(undefined);

    render(<UserManagementSection />);

    openManagerUsers();
    await screen.findByText("bob");
    fireEvent.click(screen.getByRole("button", { name: /supprimer bob/i }));
    await user.click(screen.getByRole("button", { name: /^supprimer$/i }));

    await waitFor(() => expect(api.deleteAdminUser).toHaveBeenCalledWith(2));
    expect(screen.queryByText("bob")).not.toBeInTheDocument();
  });

  it("affiche les erreurs API", async () => {
    vi.mocked(api.adminUsers).mockRejectedValue(new Error("Droits administrateur requis."));

    render(<UserManagementSection />);

    openManagerUsers();
    expect(await screen.findByText("Droits administrateur requis.")).toBeInTheDocument();
  });
});
