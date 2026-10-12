# Data notes (Pair A)

Profile of `extrusion_shift_log.csv` and `stage_daily.csv`. Every finding is reproducible with `python3 scripts/profile_data.py`.

**Decision (team):** highlight anomalies rather than omit them. The dashboard has two views: **Corrected** (default; duplicates dropped and kg rows divided by 1000, nothing else changed) and **As logged** (raw). Every anomaly is numbered and marked on the charts, and each one's open question for Hervé is listed in the dashboard's Data notes section.

## Shape

| File | Rows | Expected | Notes |
|---|---|---|---|
| extrusion_shift_log.csv | 1,890 | 1,890 (90 days × 3 shifts × 7 lines) | Total matches only by coincidence: 7 duplicates plus 7 missing rows |
| stage_daily.csv | 270 | 270 (90 days × 3 stages) | Complete, no duplicates, no nulls |

There are no nulls and no negative values. `scrap_t` never exceeds `output_t`. Changeover minutes and counts are consistent: there are no minutes without a changeover, and no changeover without minutes.

## Anomalies

| # | What | Where | Effect if ignored | Proposed handling | Question for the team or Hervé |
|---|---|---|---|---|---|
| 1 | **Exact duplicate rows**: all 7 lines of one shift appear twice | 2026-03-11, shift A, M01 to M07 (14 rows) | +77.0 t output and +7 changeovers on that day; that day's log total no longer matches `stage_daily` | Drop the duplicates and keep one copy | None needed: the log matches `stage_daily` (242.7 t) after removing them |
| 2 | **Unit error (kg instead of t)** in `output_t` and `scrap_t` | M06, shift B, 22, 23 and 24 Jan | Output inflated ~1000×: 12,750 "t" in one shift against 14.3 t capacity, so plant performance and OEE are meaningless | Divide `output_t` and `scrap_t` by 1000 on those 3 rows. After the fix, the daily log matches `stage_daily` within 0.05 t | Was this one operator or one data-entry screen? Could other fields be affected too? |
| 3 | **Missing shift**: no rows at all for shift C | 2026-02-17, all 7 lines | 7 rows missing | Treat as a genuine non-production shift and don't impute. `stage_daily` agrees: planned_min is 6,720 (2/3 of a day) and extrusion output is 161.9 t, the same as the log total for A + B | Was the plant down that night (holiday, power, strike), or did the C shift log go missing? |
| 4 | **planned_min = 0** for a whole day | M03, 2026-03-01, shifts A, B, C | Division by zero in per-row ratios; M03 looks dead that day | Keep the rows (they add 0 to sums) and never compute row-level ratios. `stage_daily` agrees: 8,640 planned min (6 units) | Planned maintenance on M03? |
| 5 | **Stops exceed planned time**: 409 + 42 + 33 = 484 min in a 480 min shift; run_min recorded as 0 | M03, 2026-03-31, shift C | Availability is unaffected because run_min is already 0, but downtime is over-counted by 4 min | Keep run_min = 0 and flag the row. Overlapping or rounded stop logging is likely | How are stop minutes logged? Can categories overlap? |
| 6 | **ideal_rate_tph is 2.3 for every line, every shift** | Whole file | If lines really differ, per-machine performance is wrong | Use 2.3 as given | Do all 7 lines really share one nameplate rate, regardless of product/recipe? |
| 7 | **Packing output ≈ good extrusion output, not gross** | `stage_daily` packing vs log | None, but don't compare packing with gross extrusion output | Use good output (`output_t − scrap_t`) for "good output per day" | Is the daily ±5 t gap a WIP buffer between extrusion and packing? |

## Repo housekeeping

- `README.md` and `CLAUDE.md` point to `data/DATA_DICTIONARY.md`, but the dictionary and the CSVs are at the repo root.
- The file named `download` contains `.gitignore` rules (`node_modules/`, `.next/`, …). It probably should be renamed to `.gitignore`.

## Early signal (not yet a KPI, computed on raw data)

Mean unit-minutes per day in `stage_daily`:

| Stage | Output (t) | Starved (min) | Blocked (min) |
|---|---|---|---|
| mixing | 246.3 | 59.6 | 1,168.6 |
| extrusion | 243.6 | 34.3 | 25.4 |
| packing | 228.6 | 1,657.9 | 35.0 |

Mixing is blocked by extrusion, packing is starved by extrusion, and extrusion is neither starved nor blocked. Extrusion looks like the constraint. Changeovers are also rising: 230 in January, 247 in February and 323 in March (after dropping the duplicates).
