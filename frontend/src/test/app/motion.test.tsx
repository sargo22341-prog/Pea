import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MOTION, staggerDelay } from "../../components/common/motion";
import { ConfirmDialog } from "../../components/common/feedback/ConfirmDialog";

describe("staggerDelay", () => {
  it("n'ajoute aucun delai a la premiere ligne", () => {
    expect(staggerDelay(0)).toBeUndefined();
  });

  it("decale chaque ligne suivante d'un pas constant", () => {
    expect(staggerDelay(1)).toBe("35ms");
    expect(staggerDelay(3)).toBe("105ms");
  });

  it("plafonne le decalage pour ne pas faire attendre les listes longues", () => {
    expect(staggerDelay(8)).toBe(staggerDelay(200));
  });

  it("ignore une position invalide", () => {
    expect(staggerDelay(Number.NaN)).toBeUndefined();
    expect(staggerDelay(-2)).toBeUndefined();
  });
});

describe("fenetres modales", () => {
  it("anime le voile et le panneau a l'ouverture", () => {
    render(
      <ConfirmDialog
        description="Cette action est definitive."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        title="Supprimer la position"
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass(MOTION.dialog);
    expect(dialog.parentElement).toHaveClass(MOTION.overlay);
  });
});
