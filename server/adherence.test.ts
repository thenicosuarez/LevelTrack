import { test } from "node:test";
import assert from "node:assert/strict";
import { computeShotAdherence } from "./adherence";

const today = "2026-10-01";
const daysAgo = (n: number) =>
  new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

test("weekly injector who never misses scores 100%", () => {
  const shotDates = [28, 21, 14, 7, 0].map(daysAgo);
  assert.equal(computeShotAdherence({ shotDates, frequency: "weekly", today }), 100);
});

test("weekly injector the day before their shot still scores 100%", () => {
  const shotDates = [29, 22, 15, 8, 1].map(daysAgo);
  assert.equal(computeShotAdherence({ shotDates, frequency: "weekly", today }), 100);
});

test("weekly injector who missed one of four scores 75%", () => {
  const shotDates = [28, 14, 7].map(daysAgo);
  assert.equal(computeShotAdherence({ shotDates, frequency: "weekly", today }), 75);
});

test("weekly injector who missed one of five, including today's shot, scores 75%", () => {
  const shotDates = [28, 14, 7, 0].map(daysAgo);
  assert.equal(computeShotAdherence({ shotDates, frequency: "weekly", today }), 75);
});

test("weekly injector on shot day, before logging it, still scores 100%", () => {
  const shotDates = [28, 21, 14, 7].map(daysAgo);
  assert.equal(computeShotAdherence({ shotDates, frequency: "weekly", today }), 100);
});

test("weekly injector who is overdue loses the current period", () => {
  const shotDates = [29, 22, 15, 8].map(daysAgo);
  assert.equal(computeShotAdherence({ shotDates, frequency: "weekly", today }), 75);
});

test("daily injector counts distinct days", () => {
  const shotDates = Array.from({ length: 15 }, (_, i) => daysAgo(i));
  shotDates.push(daysAgo(0)); // duplicate entry on the same day doesn't inflate
  assert.equal(computeShotAdherence({ shotDates, frequency: "daily", today, startDate: daysAgo(29) }), 50);
});

test("biweekly injector on schedule scores 100%", () => {
  const shotDates = [28, 14, 0].map(daysAgo);
  assert.equal(computeShotAdherence({ shotDates, frequency: "biweekly", today }), 100);
});

test("new user who just started isn't penalised for earlier weeks", () => {
  assert.equal(computeShotAdherence({ shotDates: [daysAgo(2)], frequency: "weekly", today }), 100);
});

test("user who started 3 weeks ago and logged nothing scores 0%", () => {
  assert.equal(computeShotAdherence({ shotDates: [], frequency: "weekly", today, startDate: daysAgo(21) }), 0);
});

test("no shots and no start date scores 0%", () => {
  assert.equal(computeShotAdherence({ shotDates: [], frequency: "weekly", today }), 0);
});

test("future-dated shots are ignored", () => {
  assert.equal(computeShotAdherence({ shotDates: [daysAgo(-7)], frequency: "weekly", today }), 0);
});
