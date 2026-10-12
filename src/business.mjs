// Business view: MECE loss tree, improvement levers, targets and financial value. Pure functions on the corrected log.
import { groupBy, performance, quality, availability } from "./kpi.mjs";

const sum = (rows, f) => rows.reduce((a, r) => a + f(r), 0);
const days = (rows) => new Set(rows.map((r) => r.date)).size;
const monthName = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// Nameplate capacity split into six buckets that sum exactly to it (MECE):
// good + scrap + speed loss + changeover + breakdown + other stops.
// Where logged stops exceed planned - run, the three stop categories are scaled down so nothing is counted twice.
export function lossTree(rows) {
  const t = { capacity: 0, changeover: 0, breakdown: 0, otherStops: 0, speed: 0, scrap: 0, good: 0 };
  for (const r of rows) {
    const tph = r.ideal_rate_tph / 60;
    const stops = r.changeover_min + r.unplanned_downtime_min + r.other_stop_min;
    const scale = stops > 0 ? (r.planned_min - r.run_min) / stops : 0;
    t.capacity += r.planned_min * tph;
    t.changeover += r.changeover_min * scale * tph;
    t.breakdown += r.unplanned_downtime_min * scale * tph;
    t.otherStops += r.other_stop_min * scale * tph;
    t.speed += r.run_min * tph - r.output_t;
    t.scrap += r.scrap_t;
    t.good += r.output_t - r.scrap_t;
  }
  return t;
}

export function monthProfile(rows) {
  const d = days(rows);
  const changeovers = sum(rows, (r) => r.changeovers);
  const changeoverMin = sum(rows, (r) => r.changeover_min);
  const tree = lossTree(rows);
  return {
    days: d,
    changeoversPerDay: changeovers / d,
    minPerChangeover: changeoverMin / changeovers,
    changeoverShare: changeoverMin / sum(rows, (r) => r.planned_min),
    plannedMinPerDay: sum(rows, (r) => r.planned_min) / d,
    goodPerDay: tree.good / d,
    capacityPerDay: tree.capacity / d,
    treePerDay: Object.fromEntries(Object.entries(tree).map(([k, v]) => [k, v / d])),
  };
}

// How much more extrusion output the neighbouring stages can absorb before one of them becomes the constraint:
// output per productive minute times the minutes they currently lose waiting on extrusion.
export function stageHeadroom(stageRows) {
  return [...groupBy(stageRows, (r) => r.stage)].map(([stage, rs]) => {
    const planned = sum(rs, (r) => r.planned_min);
    const productive = planned - sum(rs, (r) => r.starved_min + r.blocked_min);
    const waiting = stage === "mixing" ? sum(rs, (r) => r.blocked_min) : sum(rs, (r) => r.starved_min);
    return { stage, headroomPerDay: (sum(rs, (r) => r.output_t) / productive) * waiting / rs.length };
  });
}

// Four levers, applied in order to the current run-rate (last month) so their gains never overlap.
export function levers(rows, { smedReduction }) {
  const months = [...groupBy(rows, (r) => r.date.slice(0, 7))].sort(([a], [b]) => a.localeCompare(b));
  const first = monthProfile(months[0][1]);
  const last = monthProfile(months.at(-1)[1]);
  const lastRows = months.at(-1)[1];
  const goodPerRunMin = (rs) => (rs[0].ideal_rate_tph / 60) * performance(rs) * quality(rs);
  const plantConv = goodPerRunMin(lastRows);

  const freedBatch = (last.changeoversPerDay - first.changeoversPerDay) * last.minPerChangeover;
  const freedSmed = first.changeoversPerDay * last.minPerChangeover * smedReduction;

  const byMachine = [...groupBy(rows, (r) => r.machine)].map(([machine, rs]) => ({
    machine, rows: rs, downPerDay: sum(rs, (r) => r.unplanned_downtime_min) / days(rs), perf: performance(rs),
  }));
  const worstDown = byMachine.reduce((a, b) => (b.downPerDay > a.downPerDay ? b : a));
  const peerDown = median(byMachine.filter((m) => m !== worstDown).map((m) => m.downPerDay));
  const slowest = byMachine.reduce((a, b) => (b.perf < a.perf ? b : a));
  const peerPerf = median(byMachine.filter((m) => m !== slowest).map((m) => m.perf));
  const slowRunPerDay = sum(slowest.rows, (r) => r.run_min) / days(slowest.rows);

  return {
    first, last, firstMonth: months[0][0], lastMonth: months.at(-1)[0],
    items: [
      {
        id: "batch", owner: "Sales + planning",
        title: "Batch policy for the two retail clients",
        action: `Bring changeovers back to the ${monthName(months[0][0])} rate of ${first.changeoversPerDay.toFixed(1)} a day (from ${last.changeoversPerDay.toFixed(1)}) with minimum batch sizes or consolidation windows`,
        freedMinPerDay: freedBatch, goodPerDay: freedBatch * plantConv,
      },
      {
        id: "smed", owner: "Operations",
        title: `SMED on extrusion: −${Math.round(smedReduction * 100)}% minutes per changeover`,
        action: `Cut the average changeover from ${Math.round(last.minPerChangeover)} min to ${Math.round(last.minPerChangeover * (1 - smedReduction))} min`,
        freedMinPerDay: freedSmed, goodPerDay: freedSmed * plantConv,
      },
      {
        id: "breakdowns", owner: "Maintenance",
        title: `${worstDown.machine} breakdowns down to peer level`,
        action: `${worstDown.machine} logs ${Math.round(worstDown.downPerDay)} breakdown min a day against a ${Math.round(peerDown)} min median on the other lines`,
        freedMinPerDay: worstDown.downPerDay - peerDown, goodPerDay: (worstDown.downPerDay - peerDown) * plantConv,
        machine: worstDown.machine, availability: availability(worstDown.rows),
        targetAvailability: availability(worstDown.rows) + (worstDown.downPerDay - peerDown) / (sum(worstDown.rows, (r) => r.planned_min) / days(worstDown.rows)),
      },
      {
        id: "speed", owner: "Process engineering",
        title: `${slowest.machine} speed up to peer level`,
        action: `${slowest.machine} runs at ${(slowest.perf * 100).toFixed(1)}% of nameplate against a ${(peerPerf * 100).toFixed(1)}% median on the other lines`,
        freedMinPerDay: 0,
        goodPerDay: slowRunPerDay * (slowest.rows[0].ideal_rate_tph / 60) * (peerPerf - slowest.perf) * quality(slowest.rows),
        machine: slowest.machine, performance: slowest.perf, targetPerformance: peerPerf,
      },
    ],
  };
}

export function financials(tonnesPerDay, a) {
  const eurPerT = a.annualRevenueEur.value / a.annualTonnes.value;
  const tPerYear = tonnesPerDay * a.daysPerYear.value;
  return { eurPerT, tPerYear, revenue: tPerYear * eurPerT, contribution: tPerYear * eurPerT * a.contributionMargin.value };
}
