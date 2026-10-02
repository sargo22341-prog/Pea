import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExternalHttpsUrl, normalizeNewsArticles } from "../../services/yahoo/news/news.mapper.js";

test("external news URLs are normalized to HTTPS", () => {
  assert.equal(normalizeExternalHttpsUrl("http://example.com/article?id=1"), "https://example.com/article?id=1");
  assert.equal(normalizeExternalHttpsUrl("//cdn.example.com/image.png"), "https://cdn.example.com/image.png");
  assert.equal(normalizeExternalHttpsUrl("https://example.com/article"), "https://example.com/article");
});

test("unsafe or malformed news URLs are rejected", () => {
  assert.equal(normalizeExternalHttpsUrl("javascript:alert(1)"), undefined);
  assert.equal(normalizeExternalHttpsUrl("data:text/html,hello"), undefined);
  assert.equal(normalizeExternalHttpsUrl("not a url"), undefined);
});

test("news articles keep HTTP inputs after HTTPS normalization", () => {
  const articles = normalizeNewsArticles([
    {
      title: "Article",
      link: "http://example.com/news",
      thumbnail: { originalUrl: "//cdn.example.com/news.png" }
    },
    { title: "Unsafe", link: "javascript:alert(1)" }
  ]);

  assert.equal(articles.length, 1);
  const [article] = articles;
  assert.ok(article);
  assert.equal(article.url, "https://example.com/news");
  assert.equal(article.imageUrl, "https://cdn.example.com/news.png");
});

function imageOf(resolutions: { url?: string; width?: number; tag?: string }[]) {
  return normalizeNewsArticles([{ title: "Article", link: "https://example.com/news", thumbnail: { resolutions } }])[0]?.imageUrl;
}

test("news thumbnails use the small Yahoo resolution instead of the full-size original", () => {
  assert.equal(imageOf([
    { url: "https://cdn.example.com/original.jpg", width: 1200, tag: "original" },
    { url: "https://cdn.example.com/140.jpg", width: 140, tag: "140x140" }
  ]), "https://cdn.example.com/140.jpg");
});

test("news thumbnails prefer the smallest resolution that covers a high-density thumbnail", () => {
  assert.equal(imageOf([
    { url: "https://cdn.example.com/original.jpg", width: 1200 },
    { url: "https://cdn.example.com/400.jpg", width: 400 },
    { url: "https://cdn.example.com/240.jpg", width: 240 },
    { url: "https://cdn.example.com/140.jpg", width: 140 }
  ]), "https://cdn.example.com/240.jpg");
});

test("news thumbnails fall back to the first resolution when no width is known", () => {
  assert.equal(imageOf([{ url: "https://cdn.example.com/only.jpg" }]), "https://cdn.example.com/only.jpg");
  assert.equal(imageOf([]), undefined);
});
