// Reads the CSVs, computes every KPI in both views (as logged / corrected) and writes dist/index.html.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  loadCsv, detectAnomalies, oeeBreakdown, oee, goodOutput, dailyGoodOutput, changeoversPerWeek,
  stageConstraint, dateRange, groupBy, weekStart,
} from "./src/kpi.mjs";

const log = loadCsv("extrusion_shift_log.csv");
const stage = loadCsv("stage_daily.csv");
const dates = [...new Set([...log, ...stage].map((r) => r.date))].sort();
const [from, to] = [dates[0], dates.at(-1)];
const allDates = dateRange(from, to);
const machines = [...new Set(log.map((r) => r.machine))].sort();

const { findings, corrected, mismatchedDays } = detectAnomalies(log, stage, { from, to, machines });

const sum = (rows, f) => rows.reduce((a, r) => a + f(r), 0);

function view(rows) {
  const daily = dailyGoodOutput(rows, allDates);
  const rolling = daily.map((_, i) => {
    const w = daily.slice(Math.max(0, i - 6), i + 1);
    return sum(w, (d) => d.good_t) / w.length;
  });
  const byMonth = [...groupBy(rows, (r) => r.date.slice(0, 7))].map(([month, rs]) => ({
    month,
    good_t_per_day: goodOutput(rs) / new Set(rs.map((r) => r.date)).size,
    changeover_share: sum(rs, (r) => r.changeover_min) / sum(rs, (r) => r.planned_min),
    downtime_share: sum(rs, (r) => r.unplanned_downtime_min) / sum(rs, (r) => r.planned_min),
    good_t_per_run_min: goodOutput(rs) / sum(rs, (r) => r.run_min),
    planned_min_per_day: sum(rs, (r) => r.planned_min) / new Set(rs.map((r) => r.date)).size,
    changeovers: sum(rs, (r) => r.changeovers),
  }));
  return {
    plant: oeeBreakdown(rows),
    machines: machines.map((m) => ({ machine: m, ...oeeBreakdown(rows.filter((r) => r.machine === m)) })),
    daily: daily.map((d, i) => ({ ...d, rolling_t: rolling[i] })),
    weeks: changeoversPerWeek(rows, allDates),
    byMonth,
    goodPerDay: goodOutput(rows) / allDates.length,
    changeovers: sum(rows, (r) => r.changeovers),
    m07Oee: oee(rows.filter((r) => r.machine === "M07")),
    week23Mar: sum(rows.filter((r) => weekStart(r.date) === "2026-03-23"), (r) => r.changeovers),
  };
}

const views = { corrected: view(corrected), asLogged: view(log) };
const constraint = stageConstraint(stage);

// Insight: how much of the drop in daily good output the rise in changeover time explains, on the constraint.
const [first, , last] = views.corrected.byMonth;
const extraMinPerDay = (last.changeover_share - first.changeover_share) * last.planned_min_per_day;
const lostTPerDay = extraMinPerDay * last.good_t_per_run_min;
const dropTPerDay = first.good_t_per_day - last.good_t_per_day;
const insight = {
  firstMonth: first.month, lastMonth: last.month,
  firstShare: first.changeover_share, lastShare: last.changeover_share,
  firstChangeovers: first.changeovers, lastChangeovers: last.changeovers,
  extraMinPerDay, lostTPerDay, dropTPerDay,
};

const data = {
  period: { from, to, days: allDates.length, machines },
  rowCount: log.length,
  views, constraint, insight, findings, mismatchedDays,
  builtAt: new Date().toISOString(),
};

const json = JSON.stringify(data).replace(/</g, "\\u003c");
const html = readFileSync("src/template.html", "utf8").replace("/*__DATA__*/null", json);
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", html);
console.log(`dist/index.html written (${(html.length / 1024).toFixed(0)} KB), ${findings.length} anomalies flagged`);
