// Inputs that do not come from the CSVs. Each one names its source; "assumption" entries must be confirmed by the site.
export const ASSUMPTIONS = {
  annualTonnes: { value: 86000, unit: "t/yr", source: "Brief (README): plant volume" },
  annualRevenueEur: { value: 148e6, unit: "€/yr", source: "Brief (README): plant revenue" },
  contributionMargin: {
    value: 0.2, unit: "share of revenue", short: (v) => `a ${v * 100}% contribution margin (confirm with finance)`,
    source: "Assumption, not in the data: typical for compounding, where resin is most of the variable cost. Confirm with finance",
  },
  smedReduction: {
    value: 0.3, unit: "share of minutes per changeover", short: (v) => `SMED cuts minutes per changeover by ${v * 100}% (low end of the typical 30 to 50%)`,
    source: "Assumption: a first SMED wave typically cuts changeover time 30 to 50%; we take the low end",
  },
  daysPerYear: { value: 365, unit: "days", source: "Plant runs 7 days a week, 3 shifts (brief)" },
};
