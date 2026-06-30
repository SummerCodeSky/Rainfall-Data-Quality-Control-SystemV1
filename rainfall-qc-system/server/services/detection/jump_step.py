import pandas as pd

from services.detection.base import BaseDetector
from services.station_loader import find_rainfall_events
from models.station import DetectionResult


class JumpStepDetector(BaseDetector):
    name = "JumpStepDetector"
    data_type = "excerpt"

    def detect(
        self,
        data: pd.DataFrame,
        stations: list[dict],
        config: dict,
    ) -> list[DetectionResult]:
        cfg = config.get("detection", {}).get("jump_step", {})
        if not cfg.get("enabled", True):
            return []

        min_ratio = cfg.get("min_ratio", 2.0)
        min_abs_diff = cfg.get("min_abs_diff", 10.0)
        ratio_tiers = cfg.get("ratio_tiers", {
            "info": [2.0, 5.0],
            "general": [5.0, 10.0],
            "warning": [10.0, 30.0],
            "severe": 30.0,
        })
        abs_diff_tiers = cfg.get("abs_diff_tiers", {
            "info": [10.0, 20.0],
            "general": [20.0, 50.0],
            "warning": [50.0, 100.0],
            "severe": 100.0,
        })

        results = []
        for station_id, grp in data.groupby("station_id"):
            grp = grp.sort_values("datetime").reset_index(drop=True)
            values = grp["precipitation"].values
            datetimes = grp["datetime"].values
            n = len(values)

            events = find_rainfall_events(list(values))

            for start, end in events:
                if end - start < 2:
                    continue

                for i in range(start + 1, end):
                    prev = values[i - 1]
                    curr = values[i]

                    if prev <= 0.05:
                        continue

                    ratio = curr / prev if prev > 0 else float("inf")
                    abs_diff = curr - prev

                    is_jump = ratio >= min_ratio or abs_diff >= min_abs_diff
                    if not is_jump:
                        continue

                    level_ratio = self._level_for_value(ratio, ratio_tiers)
                    level_diff = self._level_for_value(abs_diff, abs_diff_tiers)
                    level = self._higher_level(level_ratio, level_diff)

                    if level:
                        trigger_desc = []
                        if ratio >= min_ratio:
                            trigger_desc.append(f"倍率={ratio:.1f}")
                        if abs_diff >= min_abs_diff:
                            trigger_desc.append(f"差值={abs_diff:.1f}mm")
                        trigger = "跳变：" + "，".join(trigger_desc)

                        results.append(self._result(
                            station_id=str(station_id),
                            datetime_val=str(datetimes[i]),
                            value=float(curr),
                            trigger_rule=trigger,
                            flag_level=level,
                            expected_value=float(prev),
                            deviation=float(ratio),
                            detail=f"前值={prev:.1f}mm，当前={curr:.1f}mm，倍率={ratio:.1f}，差值={abs_diff:.1f}mm",
                        ))

        return results

    def _level_for_value(self, value: float, tiers: dict) -> str | None:
        severe = tiers.get("severe")
        if isinstance(severe, (int, float)) and value >= severe:
            return "Severe"
        for lvl in ["warning", "general", "info"]:
            tier = tiers.get(lvl)
            if isinstance(tier, list) and len(tier) == 2:
                if tier[0] <= value < tier[1]:
                    return lvl.capitalize()
        return None

    def _higher_level(self, a: str | None, b: str | None) -> str | None:
        order = {"Severe": 4, "Warning": 3, "General": 2, "Info": 1}
        max_level = None
        max_score = 0
        for lvl in [a, b]:
            if lvl and order.get(lvl, 0) > max_score:
                max_score = order[lvl]
                max_level = lvl
        return max_level
