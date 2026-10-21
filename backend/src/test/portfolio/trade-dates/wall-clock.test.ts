import assert from "node:assert/strict";
import test from "node:test";
import { toUtcIso } from "../../../services/timezone/wall-clock.js";

const paris = "Europe/Paris";

test("une heure murale sans fuseau est lue à Paris, heure d'été comprise", () => {
  assert.equal(toUtcIso("2021-07-08T09:00:05", paris), "2021-07-08T07:00:05.000Z", "été : UTC+2");
  assert.equal(toUtcIso("2026-01-15T10:00:00", paris), "2026-01-15T09:00:00.000Z", "hiver : UTC+1");
  assert.equal(toUtcIso("2026-03-29T03:30", paris), "2026-03-29T01:30:00.000Z", "juste après le passage à l'heure d'été");
  assert.equal(toUtcIso("2026-03-29T01:30:00", paris), "2026-03-29T00:30:00.000Z", "juste avant le passage à l'heure d'été");
  assert.equal(toUtcIso("2026-10-25T03:30:00", paris), "2026-10-25T02:30:00.000Z", "juste après le retour à l'heure d'hiver");
  assert.equal(toUtcIso("2026-09-15T10:33:37.25", paris), "2026-09-15T08:33:37.250Z", "fractions de seconde conservées");
  assert.equal(toUtcIso("2026-09-15T10:33:37", "UTC"), "2026-09-15T10:33:37.000Z");
});

test("une date avec fuseau ou une date seule garde l'instant que JavaScript lui donne", () => {
  assert.equal(toUtcIso("2026-09-15T08:33:37.000Z", paris), "2026-09-15T08:33:37.000Z");
  assert.equal(toUtcIso("2026-09-15T10:33:37+02:00", paris), "2026-09-15T08:33:37.000Z");
  assert.equal(toUtcIso("2026-09-15", paris), "2026-09-15T00:00:00.000Z");
});

test("une valeur illisible n'est pas convertie", () => {
  assert.equal(toUtcIso("", paris), undefined);
  assert.equal(toUtcIso("15/09/2026 10:33", paris), undefined);
  assert.equal(toUtcIso("2026-13-45T99:99:00", paris), undefined);
});
