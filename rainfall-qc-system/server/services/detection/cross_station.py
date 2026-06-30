import numpy as np
import pandas as pd

from services.detection.base import BaseDetector
from models.station import DetectionResult


class CrossStationComparator(BaseDetector):
    name = "CrossStationComparator"
    data_type = "excerpt"

    def detect(
        self,
        data: pd.DataFrame,
        stations: list[dict],
        config: dict,
    ) -> list[DetectionResult]:
        cfg = config.get("detection", {}).get("cross_station", {})
        if not cfg.get("enabled", True):
            return []

        std_tiers = cfg.get("std_tiers", {
            "info": [2.0, 3.0],
            "general": [3.0, 4.0],
            "warning": [4.0, 5.0],
            "severe": 5.0,
        })
        gap_tiers = cfg.get("gap_tiers", {
            "info": [2.0, 5.0],
            "general": [5.0, 10.0],
            "warning": [10.0, 20.0],
            "severe": 20.0,
        })

        if "datetime" not in data.columns:
            return []

        results = []
        for dt, grp in data.groupby("datetime"):
            station_values = grp.set_index("station_id")["precipitation"]
            if len(station_values) < 2:
                continue

            mean = station_values.mean()
            std = station_values.std(ddof=0)

            if mean <= 0:
                continue

            for station_id, value in station_values.items():
                # Skip if both value and mean are very small to reduce noise
                if value < 0.05 and mean < 0.05:
                    continue
                gap = abs(value - mean)

                level_gap = None
                severe = gap_tiers.get("severe")
                if isinstance(severe, (int, float)) and gap >= severe:
                    level_gap = "Severe"
                else:
                    for lvl in ["warning", "general", "info"]:
                        tier = gap_tiers.get(lvl)
                        if isinstance(tier, list) and len(tier) == 2:
                            if tier[0] <= gap < tier[1]:
                                level_gap = lvl.capitalize()
                                break

                level_z = None
                if std > 0:
                    z_score = abs(value - mean) / std
                    severe_z = std_tiers.get("severe")
                    if isinstance(severe_z, (int, float)) and z_score >= severe_z:
                        level_z = "Severe"
                    else:
                        for lvl in ["warning", "general", "info"]:
                            tier = std_tiers.get(lvl)
                            if isinstance(tier, list) and len(tier) == 2:
                                if tier[0] <= z_score < tier[1]:
                                    level_z = lvl.capitalize()
                                    break
                else:
                    z_score = 0

                level = level_gap or level_z
                if not level:
                    continue

                results.append(self._result(
                    station_id=str(station_id),
                    datetime_val=str(dt),
                    value=float(value),
                    trigger_rule=f"摘录表跨站偏离：差距={gap:.1f}mm，Z-Score={z_score:.2f}",
                    flag_level=level,
                    expected_value=float(mean),
                    deviation=float(gap),
                    detail=f"区域均值={mean:.2f}mm，标准差={std:.2f}",
                ))

        return results


class PeriodMaxDetector(BaseDetector):
    name = "PeriodMaxDetector"
    data_type = "period_max"

    def detect(
        self,
        data: pd.DataFrame,
        stations: list[dict],
        config: dict,
    ) -> list[DetectionResult]:
        cfg = config.get("detection", {}).get("period_max", {})
        if not cfg.get("enabled", True):
            return []

        stagnation_count = cfg.get("stagnation_count", 3)
        gap_tiers = cfg.get("gap_tiers", {
            "info": [2.0, 5.0],
            "general": [5.0, 10.0],
            "warning": [10.0, 20.0],
            "severe": 20.0,
        })

        results = []

        for station_id, grp in data.groupby("station_id"):
            grp = grp.sort_values("period_type").reset_index(drop=True)
            values = grp["max_value"].values
            periods = grp["period_type"].values

            for i in range(len(values) - stagnation_count + 1):
                window = values[i:i + stagnation_count]
                if all(v == window[0] and v > 0 for v in window):
                    results.append(self._result(
                        station_id=str(station_id),
                        datetime_val=str(periods[i]),
                        value=float(window[0]),
                        trigger_rule=f"各时段最大降水量连续{stagnation_count}个时段值相同={window[0]}mm",
                        flag_level="Warning",
                        expected_value=None,
                        detail=f"时段{periods[i]}~{periods[i+stagnation_count-1]}，值均为{window[0]}mm",
                    ))

        if "period_type" in data.columns:
            for pt, grp in data.groupby("period_type"):
                station_values = dict(zip(grp["station_id"], grp["max_value"]))
                if len(station_values) < 2:
                    continue

                mean = sum(station_values.values()) / len(station_values)
                if mean <= 0:
                    continue

                for sid, value in station_values.items():
                    gap = abs(value - mean)
                    level = None
                    severe = gap_tiers.get("severe")
                    if isinstance(severe, (int, float)) and gap >= severe:
                        level = "Severe"
                    else:
                        for lvl in ["warning", "general", "info"]:
                            tier = gap_tiers.get(lvl)
                            if isinstance(tier, list) and len(tier) == 2:
                                if tier[0] <= gap < tier[1]:
                                    level = lvl.capitalize()
                                    break

                    if level:
                        results.append(self._result(
                            station_id=str(sid),
                            datetime_val=str(pt),
                            value=float(value),
                            trigger_rule=f"各时段最大降水量跨站偏离：差距={gap:.1f}mm",
                            flag_level=level,
                            expected_value=float(mean),
                            deviation=float(gap),
                            detail=f"区域均值={mean:.1f}mm",
                        ))

        return results
