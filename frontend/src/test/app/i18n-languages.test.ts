import { afterEach, describe, expect, it } from "vitest";
import { changeAppLanguage, i18n } from "../../i18n";

describe("interface languages", () => {
  afterEach(async () => {
    await changeAppLanguage("fr");
  });

  it("starts with French only and loads English on demand", async () => {
    expect(i18n.hasResourceBundle("fr", "navigation")).toBe(true);
    expect(i18n.t("navigation:logout")).toBe("Se deconnecter");

    await changeAppLanguage("en");
    expect(i18n.language).toBe("en");
    expect(i18n.t("navigation:logout")).toBe("Sign out");
    expect(i18n.t("navigation:newArticles", { count: 3 })).toBe("3 new articles");
    expect(localStorage.getItem("pea.language")).toBe("en");
  });

  it("switches back to French without reloading anything", async () => {
    await changeAppLanguage("en");
    await changeAppLanguage("fr");
    expect(i18n.t("navigation:newArticles", { count: 1 })).toBe("1 nouvel article");
    expect(document.documentElement.lang).toBe("fr");
  });
});
