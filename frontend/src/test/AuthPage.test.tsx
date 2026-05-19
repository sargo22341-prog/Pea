import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthPage } from "../pages/auth/AuthPage";

describe("AuthPage – login mode", () => {
  it("renders the Connexion title", () => {
    render(<AuthPage mode="login" onLogin={vi.fn()} />);
    expect(screen.getByText("Connexion")).toBeInTheDocument();
  });

  it("does not render the confirmation password field", () => {
    render(<AuthPage mode="login" onLogin={vi.fn()} />);
    expect(screen.queryByText("Confirmation")).not.toBeInTheDocument();
  });

  it("shows error when username is empty and form is submitted", async () => {
    render(<AuthPage mode="login" onLogin={vi.fn()} />);
    fireEvent.submit(screen.getByRole("button", { name: /se connecter/i }).closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("Username requis.")).toBeInTheDocument();
    });
  });

  it("shows error when password is empty and username is filled", async () => {
    const user = userEvent.setup();
    render(<AuthPage mode="login" onLogin={vi.fn()} />);
    await user.type(screen.getByLabelText(/username/i), "alice");
    fireEvent.submit(screen.getByRole("button", { name: /se connecter/i }).closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("Mot de passe requis.")).toBeInTheDocument();
    });
  });

  it("calls onLogin with username and password on valid submit", async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<AuthPage mode="login" onLogin={onLogin} />);
    await user.type(screen.getByLabelText(/username/i), "alice");
    await user.type(screen.getByLabelText(/mot de passe/i), "secret123");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));
    await waitFor(() => {
      // In login mode confirmPassword state stays "" (never filled in)
      expect(onLogin).toHaveBeenCalledWith({ username: "alice", password: "secret123", confirmPassword: "" });
    });
  });

  it("shows the error returned by onLogin", async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error("Identifiants incorrects."));
    const user = userEvent.setup();
    render(<AuthPage mode="login" onLogin={onLogin} />);
    await user.type(screen.getByLabelText(/username/i), "alice");
    await user.type(screen.getByLabelText(/mot de passe/i), "wrong");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));
    await waitFor(() => {
      expect(screen.getByText("Identifiants incorrects.")).toBeInTheDocument();
    });
  });

  it("disables the submit button while saving", async () => {
    let resolve!: () => void;
    const onLogin = vi.fn().mockImplementation(() => new Promise<void>((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<AuthPage mode="login" onLogin={onLogin} />);
    await user.type(screen.getByLabelText(/username/i), "alice");
    await user.type(screen.getByLabelText(/mot de passe/i), "pass");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));
    expect(screen.getByRole("button", { name: /validation/i })).toBeDisabled();
    await act(async () => {
      resolve();
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /se connecter/i })).toBeEnabled());
  });
});

describe("AuthPage – setup mode", () => {
  it("renders the Creer le premier compte title", () => {
    render(<AuthPage mode="setup" onLogin={vi.fn()} />);
    expect(screen.getByText("Creer le premier compte")).toBeInTheDocument();
  });

  it("renders the confirmation password field", () => {
    render(<AuthPage mode="setup" onLogin={vi.fn()} />);
    expect(screen.getByText("Confirmation")).toBeInTheDocument();
  });

  it("shows error when passwords do not match", async () => {
    const user = userEvent.setup();
    render(<AuthPage mode="setup" onLogin={vi.fn()} />);
    await user.type(screen.getByLabelText(/username/i), "alice");
    await user.type(screen.getByLabelText(/^mot de passe$/i), "longpassword1");
    await user.type(screen.getByLabelText(/confirmation/i), "different");
    fireEvent.submit(screen.getByRole("button", { name: /creer le compte/i }).closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("Les mots de passe ne correspondent pas.")).toBeInTheDocument();
    });
  });

  it("calls onLogin with confirmPassword on valid setup submit", async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<AuthPage mode="setup" onLogin={onLogin} />);
    await user.type(screen.getByLabelText(/username/i), "alice");
    await user.type(screen.getByLabelText(/^mot de passe$/i), "correctpassword");
    await user.type(screen.getByLabelText(/confirmation/i), "correctpassword");
    await user.click(screen.getByRole("button", { name: /creer le compte/i }));
    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith({
        username: "alice",
        password: "correctpassword",
        confirmPassword: "correctpassword"
      });
    });
  });
});
