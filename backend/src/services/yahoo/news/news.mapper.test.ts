import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExternalHttpsUrl, normalizeNewsArticles } from "./news.mapper.js";

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
  assert.equal(articles[0].url, "https://example.com/news");
  assert.equal(articles[0].imageUrl, "https://cdn.example.com/news.png");
});
