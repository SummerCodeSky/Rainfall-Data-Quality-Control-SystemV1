import pandas as pd

from services.detection.base import BaseDetector
from services.station_loader import find_rainfall_events
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
        target_values = cfg.get("target_values", [0.1, 0.2])
        max_break = cfg.get("max_break", 0.5)
        duration_tiers = cfg.get("duration_tiers", {
            "info": [3, 6],
            "general": [6, 12],
            "warning": [12, 24],
            "severe": 24,
        })

        target_set = set(target_values)
        results = []
        for station_id, grp in data.groupby("station_id"):
            grp = grp.sort_values("datetime").reset_index(drop=True)
            values = grp["precipitation"].values
            datetimes = grp["datetime"].values
            n = len(values)

            events = find_rainfall_events(list(values))
            if not events:
                continue

            for ev_start, ev_end in events:
                ev_len = ev_end - ev_start
                if ev_len < 1:
                    continue

                i = ev_start
                while i <= ev_end - window_hours:
                    window = values[i:i + window_hours]
                    in_target = all(v in target_set for v in window)
                    if not in_target:
                        i += 1
                        continue

                    seg_end = i + window_hours
                    while seg_end < ev_end and values[seg_end] in target_set:
                        seg_end += 1

                    duration = seg_end - i
                    level = self._level_for_duration(duration, duration_tiers)

                    if level:
                        max_val = float(max(values[i:seg_end]))
                        results.append(self._result(
                            station_id=str(station_id),
                            datetime_val=str(datetimes[i]),
                            value=max_val,
                            trigger_rule=f"持续微量降雨(值均为{'/'.join(str(v) for v in target_values)}mm)，持续{duration}小时",
                            flag_level=level,
                            expected_value=0.0,
                            detail=f"异常窗口={datetimes[i]} ~ {datetimes[seg_end-1]}，持续{duration}h，最大值={max_val:.1f}mm",
                        ))

                    i = seg_end

                if ev_len < window_hours and ev_len >= 3:
                    ev_values = values[ev_start:ev_end]
                    if all(v in target_set for v in ev_values):
                        duration = ev_len
                        level = self._level_for_duration(duration, duration_tiers)
                        if level:
                            max_val = float(max(ev_values))
                            results.append(self._result(
                                station_id=str(station_id),
                                datetime_val=str(datetimes[ev_start]),
                                value=max_val,
                                trigger_rule=f"持续微量降雨(值均为{'/'.join(str(v) for v in target_values)}mm)，持续{duration}小时",
                                flag_level=level,
                                expected_value=0.0,
                                detail=f"短过程持续降雨={datetimes[ev_start]} ~ {datetimes[ev_end-1]}，持续{duration}h（过程短于滑动窗口），最大值={max_val:.1f}mm",
                            ))

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
