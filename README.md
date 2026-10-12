# Polymex Plant Pulse

FDE School, Day 1 morning lab. Build time 45 minutes, demo 3 minutes.

## The situation

Polymex Industries is a plastics compounding plant: 86,000 tonnes a year, €148M revenue, seven twin-screw extrusion lines (M01 to M07) fed by a mixing hall and followed by a packing hall, running three shifts a day (A 06:00 to 14:00, B 14:00 to 22:00, C 22:00 to 06:00), seven days a week. On-time-in-full delivery has been slipping since January, when two retail clients started ordering small, frequent batches.

Hervé, the site director, wants to see the plant "on one page" before Friday. You have the shift logs for January to March 2026.

## What to build

A one-page web app, deployed on Vercel, that shows:

1. Good output per day and its trend over the 90 days.
2. Extrusion OEE for the plant and per machine, split into availability, performance and quality.
3. Which stage is the constraint, and the evidence for it.
4. Changeovers per week over the period.
5. One insight Hervé does not know yet, stated as a sentence with a number.
6. A "Data notes" section listing every anomaly you found in the data and how you handled it.

Every number must be computed from the CSV files. Nothing typed by hand.

## How to work (teams of four)

- Pair A builds the app with Claude Code, from this repository.
- Pair B computes three numbers independently, without looking at Pair A's code: plant extrusion OEE, M07 OEE, and changeovers in the week of 23 March. Use Python, a spreadsheet, or anything else. Record the method in `VERIFY.md`.
- You demo only when both pairs agree on all three numbers, or when you can explain the difference.

## Definition of done

- A public Vercel URL that loads in under three seconds.
- KPI functions covered by at least three unit tests.
- `VERIFY.md` filled in by Pair B; `DATA_NOTES.md` written by Pair A.
- The repository pushed to GitHub.

## Demo (three minutes, no slides)

1. The URL, live.
2. The constraint, and how you know.
3. One number you verified, and how.
4. Your insight for Hervé, in one sentence.
5. The question you would ask Hervé first on Monday.

## Getting started

```bash
git clone <this repository> && cd polymex-plant-pulse
claude
```

Then tell Claude Code what you want to build. `CLAUDE.md` already gives it the context and the working rules. A Next.js app reading the CSVs at build time is the fastest path to Vercel, but any stack that deploys is fine.

To deploy: `npx vercel` from the project folder (log in with your Vercel account), or import the GitHub repository at vercel.com/new.
