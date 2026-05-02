import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeText,
  normalizeFrenchNumber,
  parseFrenchDate,
  parseFrenchMoney
} from "../services/boursorama/avisOperesParser.service.js";

test("normalizeFrenchNumber converts French decimal notation to JS numbers", () => {
  assert.equal(normalizeFrenchNumber("1 234,56"), 1234.56);
  assert.equal(normalizeFrenchNumber("100"), 100);
  assert.equal(normalizeFrenchNumber("0,50"), 0.5);
  assert.equal(normalizeFrenchNumber("42,00"), 42);
});

test("normalizeFrenchNumber returns 0 for strings that clean to empty, and undefined only when result is NaN", () => {
  assert.equal(normalizeFrenchNumber("n/a"), 0);
  assert.equal(normalizeFrenchNumber("abc"), 0);
  assert.equal(normalizeFrenchNumber(""), 0);
  assert.equal(normalizeFrenchNumber("."), undefined);
});

test("normalizeFrenchNumber handles values with non-breaking spaces", () => {
  const nonBreakingSpace = String.fromCharCode(160);
  const value = "1" + nonBreakingSpace + "000,00";
  assert.equal(normalizeFrenchNumber(value), 1000);
});

test("parseFrenchDate converts JJ/MM/AAAA to ISO local string", () => {
  assert.equal(parseFrenchDate("30/04/2026"), "2026-04-30T00:00:00");
  assert.equal(parseFrenchDate("01/01/2025"), "2025-01-01T00:00:00");
});

test("parseFrenchDate includes time when provided", () => {
  assert.equal(parseFrenchDate("15/03/2026", "14:30:00"), "2026-03-15T14:30:00");
});

test("parseFrenchDate returns undefined for invalid input", () => {
  assert.equal(parseFrenchDate(undefined), undefined);
  assert.equal(parseFrenchDate(""), undefined);
  assert.equal(parseFrenchDate("not-a-date"), undefined);
});

test("parseFrenchDate falls back to midnight when time is malformed", () => {
  const result = parseFrenchDate("10/06/2026", "bad-time");
  assert.equal(result, "2026-06-10T00:00:00");
});

test("parseFrenchMoney returns undefined for missing or empty input", () => {
  assert.equal(parseFrenchMoney(undefined), undefined);
  assert.equal(parseFrenchMoney(""), undefined);
});

test("parseFrenchMoney converts French-formatted money strings", () => {
  assert.equal(parseFrenchMoney("1 234,56"), 1234.56);
  assert.equal(parseFrenchMoney("0,50"), 0.5);
});

test("normalizeText removes NUL characters from PDF-extracted text", () => {
  const nul = String.fromCharCode(0);
  const withNul = "hello" + nul + "world";
  const result = normalizeText(withNul);
  assert.equal(result, "helloworld");
  assert.ok(!result.includes(nul), "NUL character should be removed");
});

test("normalizeText normalises carriage returns and collapses excess blank lines", () => {
  const text = "line1\r\nline2\n\n\n\nline3";
  const result = normalizeText(text);
  assert.ok(!result.includes("\r"), "should have no carriage returns");
  assert.ok(result.includes("line1"));
  assert.ok(result.includes("line3"));
  const blankLines = result.match(/\n{3,}/);
  assert.equal(blankLines, null, "should have no runs of 3+ blank lines");
});

test("normalizeText trims leading and trailing whitespace", () => {
  const result = normalizeText("   hello world   ");
  assert.equal(result, "hello world");
});
