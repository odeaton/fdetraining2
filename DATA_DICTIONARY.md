# Data dictionary

## extrusion_shift_log.csv
One row per date, shift and extrusion line. Period: 1 January to 31 March 2026.

| Column | Meaning |
|---|---|
| date | Calendar date of the shift start (YYYY-MM-DD) |
| shift | A (06:00 to 14:00), B (14:00 to 22:00), C (22:00 to 06:00) |
| machine | Extrusion line, M01 to M07 |
| planned_min | Minutes the line was planned to run in the shift |
| changeovers | Number of product changeovers started in the shift |
| changeover_min | Minutes spent changing over, purging and restarting to spec |
| unplanned_downtime_min | Logged breakdown minutes |
| other_stop_min | Logged minutes waiting for material, cleaning, meetings |
| run_min | planned_min minus the three stop categories |
| output_t | Gross output, tonnes |
| scrap_t | Output rejected or reworked, tonnes |
| ideal_rate_tph | Nameplate rate of the line, tonnes per hour |

## stage_daily.csv
One row per date and stage of the plant flow (mixing, then extrusion, then packing). Each stage has 7 units.

| Column | Meaning |
|---|---|
| date | Calendar date |
| stage | mixing, extrusion or packing |
| units | Number of units in the stage |
| planned_min | Planned unit-minutes for the day |
| output_t | Stage output, tonnes |
| starved_min | Unit-minutes waiting for material from the upstream stage |
| blocked_min | Unit-minutes stopped because the downstream stage could not take more |
