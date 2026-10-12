// Executive view shared by the dashboard and the one-pager: sponsor problem, CEO hypothesis,
// MECE issue tree, levers with financial value, KPI targets and leadership decisions.
// Every number comes from the model built in buildExecutiveModel(); the HTML is rendered at build time.
import { stageConstraint } from "./kpi.mjs";
import { lossTree, stageHeadroom, levers, financials, ebitUplift, changeoverSensitivity } from "./business.mjs";
import { HYPOTHESES } from "./hypotheses.mjs";

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
    ebit: ebitUplift(financials(total, assumptions).revenue, assumptions),
    ebitRange: assumptions.marginRange.value.map((mg) => ebitUplift(financials(total, assumptions).revenue, assumptions, mg)),
    headroom, constraint, byStage,
    treePerDay: Object.fromEntries(Object.entries(tree).map(([k, v]) => [k, v / nDays])),
    annualisedGood: (tree.good / nDays) * assumptions.daysPerYear.value,
    assumptions, anomalyCount: findings.length,
    sensitivity: changeoverSensitivity(corrected), hypotheses: HYPOTHESES,
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

  // Three-branch MECE hypothesis tree with priors. H1's mechanism is tested with the shift logs; H2 and H3 need order data.
  const lossRow = (label, key, note = "") => {
    const d = l.treePerDay[key] - f.treePerDay[key];
    const big = Math.abs(d) >= 2;
    const yr = (m.treePerDay[key] * A.daysPerYear.value * A.annualRevenueEur.value) / A.annualTonnes.value;
    return `<tr class="${big ? "hot" : ""}"><td>${esc(label)}${note ? ` <span class="muted">${esc(note)}</span>` : ""}</td>
      <td class="num">${t1(f.treePerDay[key])}</td><td class="num">${t1(l.treePerDay[key])}</td>
      <td class="num ${big ? "up" : ""}">${signed(d, t1)}</td><td class="num">${eurM(yr)}</td></tr>`;
  };
  const sens = m.sensitivity;
  const [h1, h2, h3] = m.hypotheses;
  const prior = (h) => `<span class="prior" title="Prior ${pct(h.prior, 0)}"><span style="width:${h.prior * 100}%"></span></span><b class="prior-v">${pct(h.prior, 0)}</b> <span class="muted">prior</span>`;
  const sub = (kind, text, detail) => `<div class="node">${chip(kind, kind === "yes" ? "Confirmed" : "Rejected")} ${esc(text)}<div class="muted">${esc(detail)}</div></div>`;
  const hNode = (h, status, kind, body) => `
      <div class="node"><div class="hrow"><b>${esc(h.id)}. ${esc(h.title)}</b> ${prior(h)} ${chip(kind, status)}</div>
        <div>${esc(h.claim)}</div><div class="muted why">Why this prior: ${esc(h.why)}</div>${body}</div>`;
  const tree = `
  <div class="tree">
    <div class="node root">Why is on-time-in-full delivery slipping since ${esc(fm)}?</div>
    <div class="branch">
      ${hNode(h1, "Mechanism confirmed, OTIF link untested", "yes", `
        <div class="branch">
          ${sub("yes", "Extrusion is the constraint", `Mixing is blocked ${pct(m.byStage.mixing.blocked_share)} of its time and packing is starved ${pct(m.byStage.packing.starved_share)}; extrusion loses only ${pct(m.byStage.extrusion.starved_share + m.byStage.extrusion.blocked_share)}.`)}
          ${sub("yes", "Changeovers drive output", `Each extra changeover costs ${t1(-sens.tPerChangeover)} t of good output a day, and changeovers explain ${pct(sens.r2, 0)} of day-to-day variation (r = ${sens.r.toFixed(2)}, ${sens.days} full days).`)}
          ${sub("no", "Other losses grew", "Breakdowns, other stops, speed and scrap are flat from January to March. Only changeovers grew:")}
        </div>
        <table class="mini"><tr><th>Where capacity goes (t/day)</th><th class="num">${esc(fm.slice(0, 3))}</th><th class="num">${esc(lm.slice(0, 3))}</th><th class="num">Change</th><th class="num">Q1 value/yr</th></tr>
          ${lossRow("Changeovers", "changeover")}
          ${lossRow("Breakdowns", "breakdown", `${lever.breakdowns.machine} is ${(lever.breakdowns.downPerDay / lever.breakdowns.peerDownPerDay).toFixed(1)}× its peers`)}
          ${lossRow("Other stops", "otherStops")}
          ${lossRow("Speed loss", "speed", `${lever.speed.machine} is slowest`)}
          ${lossRow("Scrap", "scrap")}
          ${lossRow("Good output", "good")}
        </table>
        <div class="muted">The six rows add up exactly to nameplate capacity (${t1(l.capacityPerDay)} t/day in ${esc(lm)}).</div>`)}
      ${hNode(h2, "Untested", "open", `<div class="muted"><b>Needs:</b> the production schedule against order due dates.</div>`)}
      ${hNode(h3, "Untested", "open", `<div class="muted"><b>Needs:</b> ordered tonnes and promised lead times against a Q4 2025 baseline.</div>`)}
    </div>
  </div>`;

  const firstTest = `
  <p><b>Weekly order-book reconciliation.</b> For every week from October 2025 to March 2026, compare three numbers per client: tonnes due by promised date, good tonnes produced, and tonnes shipped on time. Q4 gives the baseline from before the small batches started.</p>
  <p class="muted"><b>Why this test first:</b> one ERP export (order lines with client, product, tonnes, order date, promised date and ship date) separates all three branches at once. It is also the missing link: the shift logs can't see OTIF, and every euro on this page assumes the orders are there.</p>
  <table class="data"><tr><th>If the data shows</th><th>Then</th><th>Do</th></tr>
    <tr><td>Late tonnes cluster in weeks where tonnes due exceed good output, and output fell while tonnes due held at Q4 level</td><td><b>${esc(h1.id)}</b></td><td>Batch policy and SMED (levers 1 and 2) now</td></tr>
    <tr><td>Orders are late in weeks where good output covers tonnes due</td><td><b>${esc(h2.id)}</b></td><td>Fix scheduling and run a product wheel before spending on capacity</td></tr>
    <tr><td>Tonnes due or promised lead times jumped compared with Q4 while output held</td><td><b>${esc(h3.id)}</b></td><td>Reset lead-time promises with the two clients; the capacity levers then sell the extra tonnes</td></tr>
  </table>`;

  const leverRows = m.levers.map((x, i) => `<tr><td><b>${i + 1}. ${esc(x.title)}</b><div class="muted">${esc(x.action)}</div></td><td>${esc(x.owner)}</td>
    <td class="num">${signed(x.goodPerDay, t1)}</td><td class="num">${int(x.fin.tPerYear)}</td><td class="num">${eurM(x.fin.revenue)}</td><td class="num">${eurM(x.fin.contribution)}</td></tr>`).join("");
  const levers = `
  <table class="data">
    <tr><th>Lever (applied in order to the ${esc(lm)} run-rate)</th><th>Owner</th><th class="num">Good t/day</th><th class="num">t/yr</th><th class="num">Revenue/yr</th><th class="num">EBIT/yr</th></tr>
    ${leverRows}
    <tr class="total"><td><b>Total</b></td><td></td><td class="num">${signed(m.total, t1)}</td><td class="num">${int(m.totalFin.tPerYear)}</td><td class="num">${eurM(m.totalFin.revenue)}</td><td class="num">${eurM(m.ebit)}</td></tr>
  </table>
  <p class="muted">Revenue at ${int(m.totalFin.eurPerT)} €/t (€${A.annualRevenueEur.value / 1e6}M ÷ ${int(A.annualTonnes.value)} t, from the brief). EBIT is extra revenue × an assumed ${pct(A.contributionMargin.value, 0)} contribution margin with no new fixed cost; per-lever EBIT is before any fixed cost. The gain fits the plant: mixing can feed ${signed(m.headroom.mixing, t1)} t/day more and packing can take ${signed(m.headroom.packing, t1)} t/day more before either becomes the constraint. Extra tonnes only become revenue if the orders are there; late deliveries suggest they are.</p>`;

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
  const targetTable = `<table class="data targets"><tr><th>KPI</th><th class="num">Now (${esc(lm.slice(0, 3))})</th><th class="num">Target</th><th>Driven by</th></tr>
    ${targets.map(([k, a, b, c]) => `<tr><td>${esc(k)}</td><td class="num">${esc(a)}</td><td class="num"><b>${esc(b)}</b></td><td class="muted">${esc(c)}</td></tr>`).join("")}</table>`;

  const decisions = [
    ["Sales director", `Agree a batch policy with the two retail clients: minimum batch sizes, consolidation windows or a small-batch price. This is the largest lever, worth ${eurM(lever.batch.fin.revenue)} a year in revenue.`],
    ["Site director", `Fund SMED on the 7 extrusion lines and nowhere else. Mixing and packing are waiting on extrusion, so extra capacity there would add nothing.`],
    ["Planning", "Run a fixed product wheel on extrusion so the changeover count stays capped."],
    ["Maintenance and process engineering", `Find the root cause of ${lever.breakdowns.machine}'s breakdowns and ${lever.speed.machine}'s speed loss.`],
    ["Finance and sales", "Confirm the contribution margin and the one-off implementation cost, which together set the EBIT figure, and share the order book and OTIF by client so the outcome can be measured."],
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

  const largest = m.levers.reduce((a, b) => (b.fin.revenue > a.fin.revenue ? b : a));
  const prize = `<div class="headline">
    <div class="eyebrow">Top-line financial impact</div>
    <p class="hl">${eurM(m.ebit)} a year of EBIT uplift from ${eurM(m.totalFin.revenue)} of extra revenue capacity (${pct(m.totalFin.revenue / A.annualRevenueEur.value)} on today's €${A.annualRevenueEur.value / 1e6}M), by winning back lost output on extrusion.</p>
    <div class="prize">
      <div class="lead"><div class="muted">Revenue capacity</div><div class="big">${eurM(m.totalFin.revenue)}/yr</div><div class="muted">${signed(m.totalFin.revenue / A.annualRevenueEur.value, (v) => pct(v))} on €${A.annualRevenueEur.value / 1e6}M</div></div>
      <div class="lead"><div class="muted">EBIT uplift</div><div class="big">${eurM(m.ebit)}/yr</div><div class="muted">${eurM(m.ebitRange[0])} to ${eurM(m.ebitRange[1])} at ${pct(A.marginRange.value[0], 0)} to ${pct(A.marginRange.value[1], 0)} margin</div></div>
      <div><div class="muted">Good output</div><div class="big">${signed(m.total, t1)} t/day</div><div class="muted">${int(m.totalFin.tPerYear)} t/yr</div></div>
      <div><div class="muted">Plant OEE</div><div class="big">${pct(l.goodPerDay / l.capacityPerDay)} → ${pct((l.goodPerDay + m.total) / l.capacityPerDay)}</div><div class="muted">${esc(lm)} run-rate → target</div></div>
    </div>
    <p class="muted">Largest lever: ${esc(largest.title.toLowerCase())}, worth ${eurM(largest.fin.revenue)}/yr. The revenue only arrives if the orders are there, and the first test checks that.</p>
  </div>`;

  const varCost = m.totalFin.revenue * (1 - A.contributionMargin.value);
  const ebitBridge = `<table class="data bridge">
    <tr><th>EBIT bridge, run-rate per year</th><th class="num">€</th><th>Basis</th></tr>
    <tr><td>Extra revenue capacity</td><td class="num">${eurM(m.totalFin.revenue)}</td><td class="muted">${int(m.totalFin.tPerYear)} t × ${int(m.totalFin.eurPerT)} €/t (brief's average price)</td></tr>
    <tr><td>− Variable cost (resin, energy, packaging)</td><td class="num">−${eurM(varCost)}</td><td class="muted">${pct(1 - A.contributionMargin.value, 0)} of revenue (assumed)</td></tr>
    <tr><td>= Contribution</td><td class="num">${eurM(m.totalFin.contribution)}</td><td class="muted">${pct(A.contributionMargin.value, 0)} margin (assumed, confirm with finance)</td></tr>
    <tr><td>− New fixed cost</td><td class="num">${A.incrementalFixedCostEur.value ? "−" : ""}${eurM(A.incrementalFixedCostEur.value)}</td><td class="muted">Same lines, shifts and people</td></tr>
    <tr class="total"><td>= EBIT uplift</td><td class="num">${eurM(m.ebit)}</td><td class="muted">${pct(m.ebit / A.annualRevenueEur.value)} of today's revenue</td></tr>
  </table>
  <table class="data bridge"><tr><th>If the contribution margin is</th>${[A.marginRange.value[0], A.contributionMargin.value, A.marginRange.value[1]].map((mg) => `<th class="num">${pct(mg, 0)}</th>`).join("")}</tr>
    <tr><td>EBIT uplift per year</td>${[A.marginRange.value[0], A.contributionMargin.value, A.marginRange.value[1]].map((mg) => `<td class="num"><b>${eurM(ebitUplift(m.totalFin.revenue, A, mg))}</b></td>`).join("")}</tr></table>
  <p class="muted">Not included: one-off implementation cost (SMED kits, training, M02 repairs), any price concession agreed with the two retail clients under the batch policy, and OTIF penalties avoided. The first two lower year-one EBIT; the third raises it.</p>`;

  return { hypothesis, tree, firstTest, levers, prize, targetTable, decisionList, ebitBridge };
}

export const EXEC_CSS = `
.eyebrow { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-2); font-weight: 600; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ask p, .hyp p { margin: 4px 0 8px; }
.hyp > p:first-of-type { font-size: 17px; line-height: 1.45; }
.ev { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 8px 0; }
.ev .v, .prize .big { font-weight: 650; font-size: 18px; font-variant-numeric: tabular-nums; }
.prize { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 4px 0 12px; }
.prize .big { font-size: 22px; }
.headline { border: 2px solid var(--s1); border-radius: 12px; padding: 14px 16px; background: color-mix(in srgb, var(--s1) 6%, var(--surface)); }
.headline .hl { font-size: 20px; font-weight: 650; line-height: 1.3; margin: 4px 0 10px; }
.headline .prize { margin-bottom: 6px; }
.headline .lead .big { font-size: 30px; color: var(--s1); }
.headline > p.muted { margin: 0; }
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
.prior { display: inline-block; width: 60px; height: 6px; border-radius: 3px; background: var(--grid); vertical-align: middle; margin-left: 6px; overflow: hidden; }
.prior > span { display: block; height: 100%; background: var(--s1); border-radius: 3px; }
.prior-v { font-variant-numeric: tabular-nums; margin-left: 4px; }
.hrow { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; }
.tree .branch .branch { margin-left: 4px; border-left-style: dashed; }
.decisions { margin: 4px 0 0; padding-left: 20px; }
.decisions li { margin: 4px 0; }
`;
