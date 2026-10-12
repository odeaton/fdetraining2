// Three-branch MECE hypothesis tree for "why is OTIF slipping?". Priors are the team's judgement from the brief,
// set before looking at the shift logs; they sum to 1 because the branches are mutually exclusive and exhaustive
// as the primary cause: the plant makes too little, makes enough but not on time, or is asked for more than it promised.
export const HYPOTHESES = [
  {
    id: "H1", prior: 0.5,
    title: "The plant makes too little",
    claim: "Good output at the constraint fell below what the order book needs, because small batches added changeovers.",
    why: "The slip started exactly when small, frequent batches began, and changeovers are the most direct way that order pattern costs capacity.",
  },
  {
    id: "H2", prior: 0.3,
    title: "The plant makes enough, but not on time",
    claim: "Total tonnes are sufficient, but scheduling, sequencing or dispatch puts the wrong product out at the wrong time.",
    why: "Frequent small orders make sequencing harder even when capacity is fine. That is common when order patterns change.",
  },
  {
    id: "H3", prior: 0.2,
    title: "The plant is asked for more than it promised",
    claim: "Ordered volumes or promised lead times grew beyond what the plant committed to; output is not the problem.",
    why: "Possible if the two retail clients added volume, not just more order lines. The brief points to the pattern, not the volume.",
  },
];
