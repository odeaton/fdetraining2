import { test } from "node:test";
import assert from "node:assert/strict";
import { lossTree, levers, financials, changeoverSensitivity } from "../src/business.mjs";
import { HYPOTHESES } from "../src/hypotheses.mjs";

const row = (o) => ({
  date: "2026-01-01", shift: "A", machine: "M01", planned_min: 480, changeovers: 0, changeover_min: 0,
  unplanned_downtime_min: 0, other_stop_min: 0, run_min: 480, output_t: 18.4, scrap_t: 0, ideal_rate_tph: 2.3, ...o,
});

test("loss tree buckets sum exactly to nameplate capacity, even when stops overlap", () => {
  const rows = [
    row({ changeovers: 1, changeover_min: 100, unplanned_downtime_min: 30, other_stop_min: 20, run_min: 330, output_t: 11, scrap_t: 0.5 }),
    row({ machine: "M02", changeover_min: 409, unplanned_downtime_min: 42, other_stop_min: 33, run_min: 0, output_t: 0 }), // 484 min of stops in 480
  ];
  const t = lossTree(rows);
  const parts = t.good + t.scrap + t.speed + t.changeover + t.breakdown + t.otherStops;
  assert.ok(Math.abs(parts - t.capacity) < 1e-9);
  assert.ok(Math.abs(t.capacity - 2 * 480 / 60 * 2.3) < 1e-9);
});

test("batch and SMED levers free changeover minutes without double counting", () => {
  // January: 1 changeover a day of 100 min. March: 2 a day of 100 min. Two machines so peer medians exist.
  const days = (month, n, co) => Array.from({ length: n }, (_, i) => [`2026-${month}-${String(i + 1).padStart(2, "0")}`, co]);
  const rows = [...days("01", 3, 1), ...days("03", 3, 2)].flatMap(([date, co]) => ["M01", "M02"].map((machine) =>
    row({ date, machine, changeovers: machine === "M01" ? co : 0, changeover_min: machine === "M01" ? co * 100 : 0,
      run_min: 480 - (machine === "M01" ? co * 100 : 0), output_t: (480 - (machine === "M01" ? co * 100 : 0)) / 60 * 2.3 })));
  const { items } = levers(rows, { smedReduction: 0.3 });
  const by = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(by.batch.freedMinPerDay, 100); // back from 2 to 1 changeover a day
  assert.ok(Math.abs(by.smed.freedMinPerDay - 30) < 1e-9); // 30% of the 1 remaining 100-min changeover
  assert.ok(by.batch.freedMinPerDay + by.smed.freedMinPerDay <= 200); // never more than March's changeover time
});

test("financials convert tonnes per day to yearly revenue and contribution", () => {
  const A = { annualTonnes: { value: 86000 }, annualRevenueEur: { value: 148e6 }, contributionMargin: { value: 0.2 }, daysPerYear: { value: 365 } };
  const f = financials(10, A);
  assert.equal(f.tPerYear, 3650);
  assert.ok(Math.abs(f.revenue - 3650 * 148e6 / 86000) < 1e-6);
  assert.ok(Math.abs(f.contribution - f.revenue * 0.2) < 1e-6);
});

test("changeover sensitivity recovers a known slope and skips incomplete days", () => {
  const rows = [];
  for (let d = 1; d <= 4; d++) for (const shift of ["A", "B", "C"]) {
    rows.push(row({ date: `2026-01-0${d}`, shift, changeovers: shift === "A" ? d : 0, output_t: shift === "A" ? 20 - 3 * d : 20 }));
  }
  rows.push(row({ date: "2026-01-05", changeovers: 9, output_t: 0 })); // only one shift: excluded
  const s = changeoverSensitivity(rows);
  assert.equal(s.days, 4);
  assert.ok(Math.abs(s.tPerChangeover + 3) < 1e-9);
  assert.ok(Math.abs(s.r + 1) < 1e-9);
});

test("hypothesis priors are a proper distribution over three branches", () => {
  assert.equal(HYPOTHESES.length, 3);
  assert.ok(Math.abs(HYPOTHESES.reduce((a, h) => a + h.prior, 0) - 1) < 1e-9);
});
