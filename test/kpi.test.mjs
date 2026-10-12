import { test } from "node:test";
import assert from "node:assert/strict";
import {
  availability, performance, quality, oee, changeoversPerWeek, weekStart, stageConstraint, detectAnomalies, dateRange,
} from "../src/kpi.mjs";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
const row = (o) => ({
  date: "2026-03-23", shift: "A", machine: "M01", planned_min: 480, changeovers: 0, changeover_min: 0,
  unplanned_downtime_min: 0, other_stop_min: 0, run_min: 480, output_t: 18.4, scrap_t: 0, ideal_rate_tph: 2.3, ...o,
});

test("KPIs are ratios of sums, not averages of ratios", () => {
  const rows = [row({ run_min: 480, output_t: 18.4 }), row({ machine: "M02", run_min: 240, output_t: 4.6, scrap_t: 0.46 })];
  close(availability(rows), 720 / 960);
  close(performance(rows), 23 / 27.6); // average of per-row ratios would give 0.75
  close(quality(rows), (23 - 0.46) / 23);
  close(oee(rows), availability(rows) * performance(rows) * quality(rows));
});

test("KPIs return null instead of dividing by zero", () => {
  const rows = [row({ planned_min: 0, run_min: 0, output_t: 0 })];
  assert.equal(availability(rows), null);
  assert.equal(oee(rows), null);
});

test("changeovers group by ISO week starting Monday", () => {
  assert.equal(weekStart("2026-03-29"), "2026-03-23");
  assert.equal(weekStart("2026-03-23"), "2026-03-23");
  const rows = [row({ date: "2026-03-22", changeovers: 5 }), row({ date: "2026-03-23", changeovers: 2 }), row({ date: "2026-03-29", changeovers: 3 })];
  const weeks = changeoversPerWeek(rows, dateRange("2026-03-22", "2026-03-29"));
  assert.deepEqual(weeks.map((w) => [w.week, w.changeovers, w.days]), [["2026-03-16", 5, 1], ["2026-03-23", 5, 7]]);
});

test("constraint is the stage neither starved nor blocked", () => {
  const s = (stage, starved, blocked) => ({ date: "2026-01-01", stage, units: 7, planned_min: 10080, output_t: 240, starved_min: starved, blocked_min: blocked });
  assert.equal(stageConstraint([s("mixing", 50, 1200), s("extrusion", 30, 20), s("packing", 1600, 30)]).constraint, "extrusion");
});

test("anomalies are flagged and corrected without mutating the raw log", () => {
  const dup = row({ machine: "M01" });
  const kg = row({ machine: "M02", output_t: 12000, scrap_t: 600 });
  const log = [dup, { ...dup }, kg];
  const stage = [{ date: "2026-03-23", stage: "extrusion", output_t: 30.4 }];
  const { findings, corrected, mismatchedDays } = detectAnomalies(log, stage, { from: "2026-03-23", to: "2026-03-23", machines: ["M01", "M02"] });
  const ids = findings.map((f) => f.id);
  for (const id of ["duplicates", "kg_units", "missing"]) assert.ok(ids.includes(id), id);
  assert.equal(corrected.length, 2);
  assert.equal(corrected[1].output_t, 12);
  assert.equal(kg.output_t, 12000);
  assert.deepEqual(mismatchedDays, { asLogged: ["2026-03-23"], corrected: [] });
});
