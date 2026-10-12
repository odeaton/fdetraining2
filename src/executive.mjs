// Executive view shared by the dashboard and the one-pager: sponsor problem, CEO hypothesis,
// MECE issue tree, levers with financial value, KPI targets and leadership decisions.
// Every number comes from the model built in buildExecutiveModel(); the HTML is rendered at build time.
import { stageConstraint } from "./kpi.mjs";
import { lossTree, stageHeadroom, levers, financials } from "./business.mjs";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const t1 = (v) => v.toLocaleString("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const int = (v) => Math.round(v).toLocaleString("en-GB");
const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";
const eurM = (v) => "€" + (v / 1e6).toFixed(1) + "M";
const signed = (v, f) => (v >= 0 ? "+" : "−") + f(Math.abs(v));
const monthName = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en-GB", { month: "long", timeZone: "UTC" });

export function buildExecutiveModel({ corrected, stage, assumptions, findings }) {
  const lv = levers(corrected, { smedReduction: assumptions.smedReduction.value });
  const total = lv.items.reduce((a, i) => a + i.goodPerDay, 0);
  const { stages, constraint } = stageConstraint(stage);
  const byStage = Object.fromEntries(stages.map((s) => [s.stage, s]));
  const headroom = Object.fromEntries(stageHeadroom(stage).map((h) => [h.stage, h.headroomPerDay]));
  const nDays = new Set(corrected.map((r) => r.date)).size;
  const tree = lossTree(corrected);
  return {
    first: lv.first, last: lv.last, firstMonth: monthName(lv.firstMonth), lastMonth: monthName(lv.lastMonth),
    levers: lv.items.map((i) => ({ ...i, fin: financials(i.goodPerDay, assumptions) })),
    total, totalFin: financials(total, assumptions),
    headroom, constraint, byStage,
    treePerDay: Object.fromEntries(Object.entries(tree).map(([k, v]) => [k, v / nDays])),
    annualisedGood: (tree.good / nDays) * assumptions.daysPerYear.value,
    assumptions, anomalyCount: findings.length,
  };
}

export function renderExecutive(m, { compact = false } = {}) {
  const { first: f, last: l, assumptions: A } = m;
  const [fm, lm] = [m.firstMonth, m.lastMonth];
  const lever = Object.fromEntries(m.levers.map((x) => [x.id, x]));
  const coUp = l.changeoversPerDay / f.changeoversPerDay - 1;
  const coLossDelta = l.treePerDay.changeover - f.treePerDay.changeover;
  const goodDelta = l.goodPerDay - f.goodPerDay;
  const chip = (kind, text) => `<span class="chip chip-${kind}">${kind === "yes" ? "✓" : kind === "no" ? "✕" : "?"} ${esc(text)}</span>`;

  const evidence = [
    ["Changeovers per day", `${t1(f.changeoversPerDay)} → ${t1(l.changeoversPerDay)}`, `${signed(coUp, (v) => pct(v, 0))}, ${fm} to ${lm}`],
    ["Minutes per changeover", `${int(f.minPerChangeover)} → ${int(l.minPerChangeover)} min`, "flat: the issue is how often, not how long"],
    ["Capacity lost to changeovers", `${t1(f.treePerDay.changeover)} → ${t1(l.treePerDay.changeover)} t/day`, `${signed(coLossDelta, t1)} t/day`],
    ["Good output", `${t1(f.goodPerDay)} → ${t1(l.goodPerDay)} t/day`, `${signed(goodDelta, t1)} t/day`],
  ];

  // MECE: capacity at the constraint (A, split exactly into its losses) vs constraint elsewhere (B) vs allocation (C) vs demand (D).
  const lossRow = (label, key, note = "") => {
    const d = l.treePerDay[key] - f.treePerDay[key];
    const big = Math.abs(d) >= 2;
    const yr = (m.treePerDay[key] * A.daysPerYear.value * A.annualRevenueEur.value) / A.annualTonnes.value;
    return `<tr class="${big ? "hot" : ""}"><td>${esc(label)}${note ? ` <span class="muted">${esc(note)}</span>` : ""}</td>
      <td class="num">${t1(f.treePerDay[key])}</td><td class="num">${t1(l.treePerDay[key])}</td>
      <td class="num ${big ? "up" : ""}">${signed(d, t1)}</td><td class="num">${eurM(yr)}</td></tr>`;
  };
  const tree = `
  <div class="tree">
    <div class="node root">Why is on-time-in-full delivery slipping since ${esc(fm)}?</div>
    <div class="branch">
      <div class="node">${chip("yes", "Supported")} <b>A. Extrusion, the constraint, delivers less good output</b>
        <div class="muted">Nameplate capacity ${t1(l.capacityPerDay)} t/day splits into six parts that add up exactly. Only changeovers grew.</div>
        <table class="mini"><tr><th>Where capacity goes (t/day)</th><th class="num">${esc(fm.slice(0, 3))}</th><th class="num">${esc(lm.slice(0, 3))}</th><th class="num">Change</th><th class="num">Q1 value/yr</th></tr>
          ${lossRow("A1 Availability: changeovers", "changeover")}
          ${lossRow("A1 Availability: breakdowns", "breakdown", `${lever.breakdowns.machine} is 2× its peers`)}
          ${lossRow("A1 Availability: other stops", "otherStops")}
          ${lossRow("A2 Performance: speed loss", "speed", `${lever.speed.machine} is slowest`)}
          ${lossRow("A3 Quality: scrap", "scrap")}
          ${lossRow("Good output", "good")}
        </table>
      </div>
      <div class="node">${chip("no", "Rejected")} <b>B. Another stage limits the flow</b>
        <div class="muted">Mixing is blocked ${pct(m.byStage.mixing.blocked_share)} of its time, packing is starved ${pct(m.byStage.packing.starved_share)}, and extrusion loses only ${pct(m.byStage.extrusion.starved_share + m.byStage.extrusion.blocked_share)}.</div></div>
      <div class="node">${chip("open", "Untested")} <b>C. Enough output, but the wrong product at the wrong time</b>
        <div class="muted">Needs the production schedule against order due dates.</div></div>
      <div class="node">${chip("open", "Untested")} <b>D. Demand or promised lead times outgrew the plant</b>
        <div class="muted">Needs the order book and OTIF by client.</div></div>
    </div>
  </div>`;

  const leverRows = m.levers.map((x, i) => `<tr><td><b>${i + 1}. ${esc(x.title)}</b><div class="muted">${esc(x.action)}</div></td><td>${esc(x.owner)}</td>
    <td class="num">${signed(x.goodPerDay, t1)}</td><td class="num">${int(x.fin.tPerYear)}</td><td class="num">${eurM(x.fin.revenue)}</td><td class="num">${eurM(x.fin.contribution)}</td></tr>`).join("");
  const levers = `
  <table class="data">
    <tr><th>Lever (applied in order to the ${esc(lm)} run-rate)</th><th>Owner</th><th class="num">Good t/day</th><th class="num">t/yr</th><th class="num">Revenue/yr</th><th class="num">Contribution/yr</th></tr>
    ${leverRows}
    <tr class="total"><td><b>Total</b></td><td></td><td class="num">${signed(m.total, t1)}</td><td class="num">${int(m.totalFin.tPerYear)}</td><td class="num">${eurM(m.totalFin.revenue)}</td><td class="num">${eurM(m.totalFin.contribution)}</td></tr>
  </table>
  <p class="muted">Revenue at ${int(m.totalFin.eurPerT)} €/t (€${A.annualRevenueEur.value / 1e6}M ÷ ${int(A.annualTonnes.value)} t, from the brief). Contribution assumes a ${pct(A.contributionMargin.value, 0)} margin, which still needs confirming. The gain fits the plant: mixing can feed ${signed(m.headroom.mixing, t1)} t/day more and packing can take ${signed(m.headroom.packing, t1)} t/day more before either becomes the constraint. Extra tonnes only become revenue if the orders are there; late deliveries suggest they are.</p>`;

  const opsTargetShare = (f.changeoversPerDay * l.minPerChangeover * (1 - A.smedReduction.value)) / l.plannedMinPerDay;
  const targets = [
    ["OTIF by client (%)", "not in data", "set with Hervé", "Outcome KPI, needs order data"],
    ["Good output (t/day)", t1(l.goodPerDay), t1(l.goodPerDay + m.total), "All levers"],
    ["Plant extrusion OEE (%)", pct(l.goodPerDay / l.capacityPerDay), pct((l.goodPerDay + m.total) / l.capacityPerDay), "All levers"],
    ["Changeovers per day", t1(l.changeoversPerDay), t1(f.changeoversPerDay), "1. Batch policy"],
    ["Minutes per changeover (min)", int(l.minPerChangeover), int(l.minPerChangeover * (1 - A.smedReduction.value)), "2. SMED"],
    ["Changeover share of planned time (%)", pct(l.changeoverShare), pct(opsTargetShare), "1 + 2"],
    [`${lever.breakdowns.machine} availability (%, Q1)`, pct(lever.breakdowns.availability), pct(lever.breakdowns.targetAvailability), "3. Breakdowns"],
    [`${lever.speed.machine} performance (%, Q1)`, pct(lever.speed.performance), pct(lever.speed.targetPerformance), "4. Speed"],
    ["Data anomalies per quarter", String(m.anomalyCount), "0", "Fix logging at source"],
  ];
  const targetTable = `<table class="data"><tr><th>KPI</th><th class="num">Now (${esc(lm.slice(0, 3))})</th><th class="num">Target</th><th>Driven by</th></tr>
    ${targets.map(([k, a, b, c]) => `<tr><td>${esc(k)}</td><td class="num">${esc(a)}</td><td class="num"><b>${esc(b)}</b></td><td class="muted">${esc(c)}</td></tr>`).join("")}</table>`;

  const decisions = [
    ["Sales director", `Agree a batch policy with the two retail clients: minimum batch sizes, consolidation windows or a small-batch price. This is the largest lever, worth ${eurM(lever.batch.fin.revenue)} a year in revenue.`],
    ["Site director", `Fund SMED on the 7 extrusion lines and nowhere else. Mixing and packing are waiting on extrusion, so extra capacity there would add nothing.`],
    ["Planning", "Run a fixed product wheel on extrusion so the changeover count stays capped."],
    ["Maintenance and process engineering", `Find the root cause of ${lever.breakdowns.machine}'s breakdowns and ${lever.speed.machine}'s speed loss.`],
    ["Finance and sales", "Confirm the contribution margin, and share the order book and OTIF by client so the outcome can be measured."],
    ["Data owner", `Fix the ${m.anomalyCount} logging anomalies at the source before these KPIs drive bonuses or capex.`],
  ];
  const decisionList = `<ol class="decisions">${decisions.map(([o, d]) => `<li><b>${esc(o)}:</b> ${esc(d)}</li>`).join("")}</ol>`;

  const hypothesis = `
  <div class="ask"><div class="eyebrow">What Hervé asked us to solve</div>
    <p>On-time-in-full delivery has been slipping since January, when two retail clients started ordering small, frequent batches. He wants to see the plant on one page.</p></div>
  <div class="hyp"><div class="eyebrow">CEO hypothesis ${chip("yes", "Supported by the shift logs")}</div>
    <p>Small, frequent batches multiplied changeovers on extrusion, the plant's constraint. Every changeover minute there is lost plant output, and that lost output is what is making deliveries late.</p>
    <div class="ev">${evidence.map(([k, v, n]) => `<div><div class="muted">${esc(k)}</div><div class="v">${esc(v)}</div><div class="muted">${esc(n)}</div></div>`).join("")}</div>
    <p class="muted">The shift logs don't include OTIF, so the link from lost output to late deliveries is inferred, not measured. First question for Hervé on Monday: what is OTIF by client since January, and is the order book above what we ship?</p></div>`;

  const prize = `<div class="prize">
    <div><div class="muted">Prize, run-rate</div><div class="big">${signed(m.total, t1)} t/day</div><div class="muted">${int(m.totalFin.tPerYear)} t/yr of good output</div></div>
    <div><div class="muted">Revenue capacity</div><div class="big">${eurM(m.totalFin.revenue)}/yr</div><div class="muted">${pct(m.totalFin.revenue / A.annualRevenueEur.value)} of today's €${A.annualRevenueEur.value / 1e6}M</div></div>
    <div><div class="muted">Contribution</div><div class="big">${eurM(m.totalFin.contribution)}/yr</div><div class="muted">at an assumed ${pct(A.contributionMargin.value, 0)} margin</div></div>
    <div><div class="muted">Plant OEE</div><div class="big">${pct(l.goodPerDay / l.capacityPerDay)} → ${pct((l.goodPerDay + m.total) / l.capacityPerDay)}</div><div class="muted">${esc(lm)} run-rate → target</div></div>
  </div>`;

  return { hypothesis, tree, levers, prize, targetTable, decisionList };
}

export const EXEC_CSS = `
.eyebrow { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-2); font-weight: 600; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ask p, .hyp p { margin: 4px 0 8px; }
.hyp > p:first-of-type { font-size: 17px; line-height: 1.45; }
.ev { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 8px 0; }
.ev .v, .prize .big { font-weight: 650; font-size: 18px; font-variant-numeric: tabular-nums; }
.prize { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 4px 0 12px; }
.prize .big { font-size: 22px; }
.muted { color: var(--ink-2); font-size: 13px; }
.chip { display: inline-block; font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 999px; text-transform: none; letter-spacing: 0; white-space: nowrap; }
.chip-yes { background: color-mix(in srgb, #0ca30c 18%, transparent); color: var(--good-ink); }
.chip-no { background: color-mix(in srgb, #d03b3b 16%, transparent); color: var(--crit); }
.chip-open { background: color-mix(in srgb, #fab219 22%, transparent); color: var(--warn-ink); }
.tree .root { font-weight: 700; font-size: 15px; padding: 8px 12px; border: 1px solid var(--axis); border-radius: 8px; display: inline-block; }
.tree .branch { margin-left: 14px; padding-left: 16px; border-left: 2px solid var(--axis); }
.tree .branch > .node { position: relative; margin-top: 10px; }
.tree .branch > .node::before { content: ""; position: absolute; left: -16px; top: 11px; width: 12px; border-top: 2px solid var(--axis); }
table.mini, table.data { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px; }
table.mini th, table.mini td, table.data th, table.data td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--grid); vertical-align: top; }
table.mini th, table.data th { color: var(--ink-2); font-weight: 600; }
.num { text-align: right !important; font-variant-numeric: tabular-nums; white-space: nowrap; }
tr.hot td { background: color-mix(in srgb, #fab219 14%, transparent); font-weight: 600; }
td.up { color: var(--crit); }
tr.total td { border-top: 2px solid var(--axis); font-weight: 650; }
.decisions { margin: 4px 0 0; padding-left: 20px; }
.decisions li { margin: 4px 0; }
`;
