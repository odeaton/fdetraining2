// Inputs that do not come from the CSVs. Each one names its source; "assumption" entries must be confirmed by the site.
export const ASSUMPTIONS = {
  annualTonnes: { value: 86000, unit: "t/yr", source: "Brief (README): plant volume" },
  annualRevenueEur: { value: 148e6, unit: "€/yr", source: "Brief (README): plant revenue" },
  contributionMargin: {
    value: 0.2, unit: "share of revenue", short: (v) => `a ${v * 100}% contribution margin (confirm with finance)`,
    source: "Assumption, not in the data: typical for compounding, where resin is most of the variable cost. Confirm with finance",
  },
  smedReduction: {
    value: 0.3, unit: "share of minutes per changeover", short: (v) => `SMED cuts ${v * 100}% off each changeover (low end of 30 to 50%)`,
    source: "Assumption: a first SMED wave typically cuts changeover time 30 to 50%; we take the low end",
  },
  marginRange: {
    value: [0.15, 0.3], unit: "share of revenue",
    source: "Assumption: sensitivity range for the contribution margin until finance confirms it",
  },
  incrementalFixedCostEur: {
    value: 0, unit: "€/yr",
    short: (v) => (v ? `€${v / 1e6}M/yr of new fixed cost` : "no new fixed cost (one-off implementation cost excluded)"),
    source: "Assumption: the levers add volume through existing capacity; one-off SMED and maintenance costs need quotes",
  },
  daysPerYear: { value: 365, unit: "days", source: "Plant runs 7 days a week, 3 shifts (brief)" },
};
