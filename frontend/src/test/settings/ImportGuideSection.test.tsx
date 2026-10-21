import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportGuideSection } from "../../pages/settings/components/import-guide/ImportGuideSection";

const SEEN_KEY = "pea.importGuide.seen";

async function openGuide() {
  await userEvent.click(screen.getByRole("button", { name: "Ouvrir le guide" }));
  return screen.getByRole("dialog");
}

describe("ImportGuideSection", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("presents the four imports in order and marks the guide as new", () => {
    render(<ImportGuideSection />);
    expect(screen.getByText("Nouveau")).toBeInTheDocument();
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual([
      "Import CSV des positions",
      "Avis d'opéré (PDF)",
      "Relevés de coupons (PDF)",
      "Relevés espèces (PDF)"
    ]);
  });

  it("walks through the steps and tracks which ones were viewed", async () => {
    render(<ImportGuideSection />);
    const dialog = await openGuide();
    expect(within(dialog).getByRole("heading", { name: "Comment fonctionnent les imports" })).toBeInTheDocument();
    expect(within(dialog).getByText("Étape 1 sur 6")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: /Suivant/ }));
    expect(within(dialog).getByRole("heading", { name: "Import 1 · Import CSV des positions" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Étape 2 : CSV (en cours)" })).toHaveAttribute("aria-current", "step");
    expect(within(dialog).getByRole("button", { name: "Étape 1 : Principe (déjà vue)" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Étape 6 : Contrôle (à venir)" })).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Étape 5 : Espèces (à venir)" }));
    expect(within(dialog).getByText(/Avis d'opéré manquant/)).toBeInTheDocument();
    expect(localStorage.getItem(SEEN_KEY)).toBe("0,1,4");

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("3/6 étapes vues")).toBeInTheDocument();
  });

  it("shows the guide as read once every step was viewed, after a reload", async () => {
    const { unmount } = render(<ImportGuideSection />);
    const dialog = await openGuide();
    for (let step = 1; step < 6; step += 1) await userEvent.keyboard("{ArrowRight}");
    await userEvent.click(within(dialog).getByRole("button", { name: "Terminer" }));
    unmount();

    render(<ImportGuideSection />);
    expect(screen.getByText("Guide lu")).toBeInTheDocument();
  });

  it("ignores a corrupted progress value and still works without storage", async () => {
    localStorage.setItem(SEEN_KEY, "2,abc,99,-1");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    render(<ImportGuideSection />);
    expect(screen.getByText("1/6 étapes vues")).toBeInTheDocument();

    const dialog = await openGuide();
    expect(within(dialog).getByRole("button", { name: "Étape 3 : Avis d'opéré (déjà vue)" })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Fermer le guide" }));
    expect(screen.getByText("2/6 étapes vues")).toBeInTheDocument();
  });
});
