import type { NewsArticle, NewsAssetsPage, User } from "@pea/shared";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewsPage } from "../../pages/news/NewsPage";
import { objectiveUser } from "../objectives/objectiveFixture";
import { closestElement } from "../utils/dom";

const assetNews = vi.fn<(limit: number, offset: number) => Promise<NewsAssetsPage>>();

vi.mock("../../lib/api", () => ({
  api: {
    assetNews: (limit: number, offset: number) => assetNews(limit, offset),
    globalNews: vi.fn(() => Promise.resolve({ articles: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }))
  }
}));
vi.mock("../../hooks/useAuthenticatedImageUrl", () => ({ useAuthenticatedImageUrl: () => null }));

const articles: NewsArticle[] = [
  {
    title: "Air Liquide et TotalEnergies signent un accord",
    description: "",
    url: "https://example.test/accord",
    publishedAt: "2026-07-26T10:00:00.000Z",
    relatedAssets: [{ symbol: "AI.PA", name: "Air Liquide" }, { symbol: "TTE.PA", name: "TotalEnergies" }]
  },
  {
    title: "Air Liquide publie ses resultats semestriels",
    description: "",
    url: "https://example.test/resultats",
    publishedAt: "2026-07-24T10:00:00.000Z",
    relatedAssets: [{ symbol: "AI.PA", name: "Air Liquide" }],
    earningsSymbols: ["AI.PA"]
  }
];

let nextUserId = 100;

function renderPage() {
  // Le cache d'actualités est indexé par utilisateur : un identifiant par test garde les tests isolés.
  const user: User = { ...objectiveUser, id: nextUserId++ };
  render(<MemoryRouter><NewsPage user={user} /></MemoryRouter>);
}

describe("NewsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    assetNews.mockResolvedValue({ articles, limit: 8, offset: 0, totalAssets: 2, queriedAssets: 2, hasMore: false });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("shows the earnings badge on articles published around an earnings release", async () => {
    renderPage();
    const results = closestElement(await screen.findByText("Air Liquide publie ses resultats semestriels"), "a");
    expect(within(results).getByText("Resultats")).toBeInTheDocument();
    const deal = closestElement(screen.getByText("Air Liquide et TotalEnergies signent un accord"), "a");
    expect(within(deal).queryByText("Resultats")).not.toBeInTheDocument();
  });

  it("groups articles by asset with counters, only the first group open, and remembers the choice", async () => {
    renderPage();
    await screen.findByText("Air Liquide publie ses resultats semestriels");
    fireEvent.click(screen.getByRole("tab", { name: "Par actif" }));

    const airLiquide = screen.getByRole("button", { name: "Air Liquide · 2 articles · 1 lie aux resultats" });
    const total = screen.getByRole("button", { name: "TotalEnergies · 1 article" });
    const firstGroup = closestElement(airLiquide, "section");
    const links = within(firstGroup).getAllByRole("link");
    expect(links[0]).toHaveTextContent("Air Liquide publie ses resultats semestriels");
    expect(within(closestElement(total, "section")).queryByRole("link")).not.toBeInTheDocument();
    expect(localStorage.getItem("pea.news.view")).toBe("byAsset");

    fireEvent.click(total);
    expect(within(closestElement(total, "section")).getByRole("link")).toHaveTextContent("signent un accord");
  });

  it("hides the layout switch for global news", async () => {
    localStorage.setItem("pea.news.portfolioOnly", "false");
    renderPage();
    expect(await screen.findByText("Aucun article global pour le moment.")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Par actif" })).not.toBeInTheDocument();
  });

  it("keeps the list stable while later batches load and offers to show the new articles", async () => {
    const newer: NewsArticle = {
      title: "LVMH annonce une acquisition",
      description: "",
      url: "https://example.test/lvmh",
      publishedAt: "2026-07-27T10:00:00.000Z",
      relatedAssets: [{ symbol: "MC.PA", name: "LVMH" }]
    };
    assetNews.mockImplementation((_limit, offset) => Promise.resolve(offset === 0
      ? { articles, limit: 8, offset: 0, totalAssets: 9, queriedAssets: 8, hasMore: true }
      : { articles: [newer], limit: 8, offset: 8, totalAssets: 9, queriedAssets: 1, hasMore: false }));
    renderPage();
    await screen.findByText("Air Liquide publie ses resultats semestriels");

    const showNew = await screen.findByRole("button", { name: "1 nouvel article" });
    expect(screen.queryByText("LVMH annonce une acquisition")).not.toBeInTheDocument();
    fireEvent.click(showNew);
    expect(screen.getAllByRole("link")[0]).toHaveTextContent("LVMH annonce une acquisition");
    expect(screen.queryByRole("button", { name: "1 nouvel article" })).not.toBeInTheDocument();
  });

  it("reloads news older than a minute when the tab comes back to the foreground", async () => {
    renderPage();
    await screen.findByText("Air Liquide publie ses resultats semestriels");
    expect(assetNews).toHaveBeenCalledTimes(1);

    const later = Date.now() + 2 * 60_000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    act(() => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => { expect(assetNews).toHaveBeenCalledTimes(2); });
  });
});
