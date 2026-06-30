import pandas as pd

from services.detection.base import BaseDetector
from services.station_loader import find_rainfall_events
from models.station import DetectionResult


class StagnationDetector(BaseDetector):
    name = "StagnationDetector"
    data_type = "excerpt"

    def detect(
        self,
        data: pd.DataFrame,
        stations: list[dict],
        config: dict,
    ) -> list[DetectionResult]:
        cfg = config.get("detection", {}).get("stagnation", {})
        if not cfg.get("enabled", True):
            return []

        stagnation_values = cfg.get("stagnation_values", [0.1, 0.2])
        count_tiers = cfg.get("count_tiers", {
            "info": [3, 5],
            "general": [5, 8],
            "warning": [8, 12],
            "severe": 12,
        })

        results = []
        for station_id, grp in data.groupby("station_id"):
            grp = grp.sort_values("datetime").reset_index(drop=True)
            values = grp["precipitation"].values
            datetimes = grp["datetime"].values
            n = len(values)

            events = find_rainfall_events(list(values))
            if not events:
                continue

            for start, end in events:
                if end - start < 3:
                    continue

                run_start = start
                current_val = values[start]
                run_length = 1

                for i in range(start + 1, end):
                    if values[i] == current_val and current_val in stagnation_values:
                        run_length += 1
                    else:
                        if run_length >= 3 and current_val in stagnation_values:
                            level = self._level_for_count(run_length, count_tiers)
                            if level:
                                results.append(self._result(
                                    station_id=str(station_id),
                                    datetime_val=str(datetimes[run_start]),
                                    value=float(current_val),
                                    trigger_rule=f"连续{run_length}次僵直值={current_val}mm（阈值≥3次）",
                                    flag_level=level,
                                    expected_value=None,
                                    detail=f"僵直段：{datetimes[run_start]} ~ {datetimes[i-1]}，连续{run_length}个时段，值={current_val}mm",
                                ))
                        run_start = i
                        current_val = values[i]
                        run_length = 1

                if run_length >= 3 and current_val in stagnation_values:
                    level = self._level_for_count(run_length, count_tiers)
                    if level:
                        results.append(self._result(
                            station_id=str(station_id),
                            datetime_val=str(datetimes[run_start]),
                            value=float(current_val),
                            trigger_rule=f"连续{run_length}次僵直值={current_val}mm（阈值≥3次）",
                            flag_level=level,
                            expected_value=None,
                            detail=f"僵直段：{datetimes[run_start]} ~ {datetimes[end-1]}，连续{run_length}个时段，值={current_val}mm",
                        ))

        return results

    def _level_for_count(self, count: int, tiers: dict) -> str | None:
        severe = tiers.get("severe")
        if isinstance(severe, (int, float)) and count >= severe:
            return "Severe"
        for lvl in ["warning", "general", "info"]:
            tier = tiers.get(lvl)
            if isinstance(tier, list) and len(tier) == 2:
                if tier[0] <= count < tier[1]:
                    return lvl.capitalize()
        return None
