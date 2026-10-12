"""Profile the Polymex CSVs and print every anomaly listed in DATA_NOTES.md.

Usage: python3 scripts/profile_data.py   (needs pandas)
"""
import itertools
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
KEY = ["date", "shift", "machine"]
STOPS = ["changeover_min", "unplanned_downtime_min", "other_stop_min"]

ext = pd.read_csv(ROOT / "extrusion_shift_log.csv")
stage = pd.read_csv(ROOT / "stage_daily.csv")

print(f"extrusion_shift_log.csv: {len(ext)} rows, stage_daily.csv: {len(stage)} rows")
print("Rows per (date, shift):", ext.groupby(["date", "shift"]).size().value_counts().to_dict())

print("\n1. Exact duplicate rows")
print(ext[ext.duplicated(keep=False)].to_string())

print("\n2. Missing (date, shift, machine) combinations")
dates = pd.date_range("2026-01-01", "2026-03-31").strftime("%Y-%m-%d")
machines = [f"M0{i}" for i in range(1, 8)]
expected = set(itertools.product(dates, "ABC", machines))
print(sorted(expected - set(map(tuple, ext[KEY].values))))

print("\n3. Rows where planned_min is 0")
print(ext[ext.planned_min == 0].to_string())

print("\n4. Rows where run_min != planned_min - stops")
print(ext[ext.planned_min - ext[STOPS].sum(axis=1) != ext.run_min].to_string())

print("\n5. Output above nameplate capacity (likely kg instead of t)")
capacity_t = ext.run_min / 60 * ext.ideal_rate_tph
print(ext[ext.output_t > capacity_t * 1.05].to_string())

print("\n6. ideal_rate_tph values:", ext.ideal_rate_tph.unique())

print("\n7. Stage days with planned_min != 7 units x 1440 min")
print(stage[stage.planned_min != 7 * 1440].to_string())

print("\n8. Shift log vs stage_daily extrusion output (raw files)")
daily = ext.groupby("date").output_t.sum()
stage_ext = stage[stage.stage == "extrusion"].set_index("date").output_t
diff = (daily - stage_ext).round(2)
print(diff[diff.abs() > 0.1].to_string())

print("\n9. Mean starved / blocked unit-minutes per day by stage")
print(stage.groupby("stage")[["output_t", "starved_min", "blocked_min"]].mean().round(1).to_string())
