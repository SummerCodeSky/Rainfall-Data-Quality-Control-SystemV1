import pandas as pd

from services.detection.base import BaseDetector
from models.station import DetectionResult


class PersistentTraceDetector(BaseDetector):
    name = "PersistentTraceDetector"
    data_type = "excerpt"

    def detect(
        self,
        data: pd.DataFrame,
        stations: list[dict],
        config: dict,
    ) -> list[DetectionResult]:
        cfg = config.get("detection", {}).get("persistent_trace", {})
        if not cfg.get("enabled", True):
            return []

        window_hours = cfg.get("window_hours", 6)
        low_min = cfg.get("low_min", 0.1)
        low_max = cfg.get("low_max", 0.5)
        duration_tiers = cfg.get("duration_tiers", {
            "info": [3, 6],
            "general": [6, 12],
            "warning": [12, 24],
            "severe": 24,
        })

        results = []
        for station_id, grp in data.groupby("station_id"):
            grp = grp.sort_values("datetime").reset_index(drop=True)
            values = grp["precipitation"].values
            datetimes = grp["datetime"].values
            n = len(values)

            if n < window_hours:
                continue

            i = 0
            while i <= n - window_hours:
                window = values[i:i + window_hours]
                in_low_range = all(low_min <= v <= low_max and v > 0 for v in window)
                if not in_low_range:
                    i += 1
                    continue

                seg_end = i + window_hours
                while seg_end < n and low_min <= values[seg_end] <= low_max and values[seg_end] > 0:
                    seg_end += 1

                duration = seg_end - i
                level = self._level_for_duration(duration, duration_tiers)

                if level:
                    max_val = float(max(values[i:seg_end]))
                    results.append(self._result(
                        station_id=str(station_id),
                        datetime_val=str(datetimes[i]),
                        value=max_val,
                        trigger_rule=f"持续{low_min}~{low_max}mm微量降雨，持续{duration}小时",
                        flag_level=level,
                        expected_value=0.0,
                        detail=f"异常窗口={datetimes[i]} ~ {datetimes[seg_end-1]}，持续{duration}h，最大值={max_val:.1f}mm",
                    ))

                i = seg_end

        return results

    def _level_for_duration(self, duration: int, tiers: dict) -> str | None:
        severe = tiers.get("severe")
        if isinstance(severe, (int, float)) and duration >= severe:
            return "Severe"
        for lvl in ["warning", "general", "info"]:
            tier = tiers.get(lvl)
            if isinstance(tier, list) and len(tier) == 2:
                if tier[0] <= duration < tier[1]:
                    return lvl.capitalize()
        return None
