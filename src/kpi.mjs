// KPI and anomaly logic for Plant Pulse. Pure functions, no I/O except loadCsv.
import { readFileSync } from "node:fs";

export const SHIFTS = ["A", "B", "C"];
export const STOP_COLS = ["changeover_min", "unplanned_downtime_min", "other_stop_min"];
const KEY = (r) => `${r.date}|${r.shift}|${r.machine}`;

export function parseCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const cols = header.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    const row = {};
    cols.forEach((c, i) => {
      const v = cells[i];
      row[c] = v !== "" && !Number.isNaN(Number(v)) ? Number(v) : v;
    });
    return row;
  });
}

export const loadCsv = (path) => parseCsv(readFileSync(path, "utf8"));

const sum = (rows, f) => rows.reduce((acc, r) => acc + f(r), 0);
const ratio = (num, den) => (den === 0 ? null : num / den);

// KPI definitions from CLAUDE.md: ratios of sums, never averages of ratios.
export const availability = (rows) => ratio(sum(rows, (r) => r.run_min), sum(rows, (r) => r.planned_min));
export const performance = (rows) =>
  ratio(sum(rows, (r) => r.output_t), sum(rows, (r) => (r.run_min / 60) * r.ideal_rate_tph));
export const quality = (rows) => ratio(sum(rows, (r) => r.output_t - r.scrap_t), sum(rows, (r) => r.output_t));
export function oee(rows) {
  const [a, p, q] = [availability(rows), performance(rows), quality(rows)];
  return a === null || p === null || q === null ? null : a * p * q;
}
export const oeeBreakdown = (rows) => ({
  availability: availability(rows),
  performance: performance(rows),
  quality: quality(rows),
  oee: oee(rows),
});

export const goodOutput = (rows) => sum(rows, (r) => r.output_t - r.scrap_t);

export function dateRange(from, to) {
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// Monday of the ISO week containing `date` (YYYY-MM-DD).
export function weekStart(date) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

export function dailyGoodOutput(rows, dates) {
  const byDate = groupBy(rows, (r) => r.date);
  return dates.map((date) => ({ date, good_t: goodOutput(byDate.get(date) ?? []) }));
}

export function changeoversPerWeek(rows, dates) {
  const days = groupBy(dates, weekStart);
  const byWeek = groupBy(rows, (r) => weekStart(r.date));
  return [...days].map(([week, ds]) => ({
    week,
    days: ds.length,
    changeovers: sum(byWeek.get(week) ?? [], (r) => r.changeovers),
    changeover_min: sum(byWeek.get(week) ?? [], (r) => r.changeover_min),
  }));
}

// The constraint is the stage that is neither starved by upstream nor blocked by downstream:
// lowest (starved + blocked) share of its planned unit-minutes.
export function stageConstraint(stageRows) {
  const stages = [...groupBy(stageRows, (r) => r.stage)].map(([stage, rs]) => {
    const planned = sum(rs, (r) => r.planned_min);
    return {
      stage,
      output_t_per_day: sum(rs, (r) => r.output_t) / rs.length,
      starved_min_per_day: sum(rs, (r) => r.starved_min) / rs.length,
      blocked_min_per_day: sum(rs, (r) => r.blocked_min) / rs.length,
      starved_share: sum(rs, (r) => r.starved_min) / planned,
      blocked_share: sum(rs, (r) => r.blocked_min) / planned,
    };
  });
  const constraint = stages.reduce((a, b) =>
    a.starved_share + a.blocked_share <= b.starved_share + b.blocked_share ? a : b,
  ).stage;
  return { stages, constraint };
}

// Anomaly detection. Returns findings plus a corrected copy of the log; the raw log is never mutated.
export function detectAnomalies(log, stageRows, { from, to, machines }) {
  const findings = [];
  const seen = new Set();
  const dupIdx = [];
  log.forEach((r, i) => (seen.has(KEY(r)) ? dupIdx.push(i) : seen.add(KEY(r))));
  if (dupIdx.length) {
    const rs = dupIdx.map((i) => log[i]);
    findings.push({
      id: "duplicates",
      title: "Duplicate rows",
      rows: rs.map(KEY),
      dates: [...new Set(rs.map((r) => r.date))],
      detail: `${rs.length} rows are exact copies of rows already in the log`,
      handling: "Corrected view drops the second copy",
      question: "Was this shift re-imported or entered twice?",
    });
  }

  // Output above 1.5x nameplate capacity cannot be tonnes; if /1000 lands in range it was logged in kg.
  const unitIdx = log
    .map((r, i) => [r, i])
    .filter(([r]) => {
      const cap = (r.run_min / 60) * r.ideal_rate_tph;
      return cap > 0 && r.output_t > cap * 1.5 && r.output_t / 1000 <= cap * 1.05;
    })
    .map(([, i]) => i);
  if (unitIdx.length) {
    const rs = unitIdx.map((i) => log[i]);
    findings.push({
      id: "kg_units",
      title: "Output logged in kg, not tonnes",
      rows: rs.map(KEY),
      dates: [...new Set(rs.map((r) => r.date))],
      detail: rs.map((r) => `${KEY(r).replaceAll("|", " ")}: ${r.output_t} "t" vs ${((r.run_min / 60) * r.ideal_rate_tph).toFixed(1)} t capacity`).join("; "),
      handling: "Corrected view divides output_t and scrap_t by 1000",
      question: "Which entry screen or operator logged kg? Could other fields be affected?",
    });
  }

  const have = new Set(log.map(KEY));
  const missing = [];
  for (const d of dateRange(from, to)) for (const s of SHIFTS) for (const m of machines) {
    const k = `${d}|${s}|${m}`;
    if (!have.has(k)) missing.push(k);
  }
  if (missing.length) {
    const shifts = [...new Set(missing.map((k) => k.split("|").slice(0, 2).join(" shift ")))];
    findings.push({
      id: "missing",
      title: "Missing shift records",
      rows: missing,
      dates: [...new Set(missing.map((k) => k.split("|")[0]))],
      detail: `${missing.length} line-shifts have no row: ${shifts.join(", ")}`,
      handling: "Not imputed. stage_daily shows reduced planned time that day, so treated as not run",
      question: "Was the plant down that shift, or was the log lost?",
    });
  }

  const zero = log.filter((r) => r.planned_min === 0);
  if (zero.length) {
    findings.push({
      id: "planned_zero",
      title: "Zero planned minutes",
      rows: zero.map(KEY),
      dates: [...new Set(zero.map((r) => r.date))],
      detail: `${zero.length} line-shifts planned 0 min (${[...new Set(zero.map((r) => `${r.machine} on ${r.date}`))].join(", ")})`,
      handling: "Kept; adds 0 to every sum, so no KPI effect",
      question: "Planned maintenance?",
    });
  }

  const over = log.filter((r) => r.planned_min > 0 && sum(STOP_COLS, (c) => r[c]) > r.planned_min);
  if (over.length) {
    findings.push({
      id: "stops_exceed",
      title: "Stops exceed planned time",
      rows: over.map(KEY),
      dates: [...new Set(over.map((r) => r.date))],
      detail: over.map((r) => `${KEY(r).replaceAll("|", " ")}: ${sum(STOP_COLS, (c) => r[c])} min of stops in ${r.planned_min} planned`).join("; "),
      handling: "Kept as logged (run_min = 0)",
      question: "Can stop categories overlap in the logging system?",
    });
  }

  const rates = [...new Set(log.map((r) => r.ideal_rate_tph))];
  if (rates.length === 1 && machines.length > 1) {
    findings.push({
      id: "single_rate",
      title: "One nameplate rate for every line",
      rows: [],
      dates: [],
      detail: `ideal_rate_tph is ${rates[0]} t/h on all ${machines.length} lines, every shift`,
      handling: "Used as given",
      question: "Do all lines really share one rate regardless of product?",
    });
  }

  const dupSet = new Set(dupIdx);
  const unitSet = new Set(unitIdx);
  const corrected = log
    .map((r, i) => (unitSet.has(i) ? { ...r, output_t: r.output_t / 1000, scrap_t: r.scrap_t / 1000 } : r))
    .filter((_, i) => !dupSet.has(i));

  // Reconciliation against stage_daily extrusion output, as logged vs corrected.
  const stageExt = new Map(stageRows.filter((r) => r.stage === "extrusion").map((r) => [r.date, r.output_t]));
  const recon = (rows) => {
    const byDate = groupBy(rows, (r) => r.date);
    return [...stageExt].filter(([d, t]) => Math.abs(sum(byDate.get(d) ?? [], (r) => r.output_t) - t) > 0.1).map(([d]) => d);
  };

  return { findings, corrected, mismatchedDays: { asLogged: recon(log), corrected: recon(corrected) } };
}
