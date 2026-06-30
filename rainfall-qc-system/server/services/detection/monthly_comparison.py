import pandas as pd

from services.detection.base import BaseDetector
from models.station import DetectionResult


class MonthlyComparisonDetector(BaseDetector):
    name = "MonthlyComparisonDetector"
    data_type = "monthly"

    def detect(
        self,
        data: pd.DataFrame,
        stations: list[dict],
        config: dict,
    ) -> list[DetectionResult]:
        cfg = config.get("detection", {}).get("monthly_comparison", {})
        if not cfg.get("enabled", True):
            return []

        flood_months = cfg.get("flood_months", [5, 6, 7, 8, 9, 10])
        non_flood_months = cfg.get("non_flood_months", [1, 2, 3, 4, 11, 12])

        non_flood_diff_max = cfg.get("non_flood_diff_max", 10.0)
        non_flood_ratio_max = cfg.get("non_flood_ratio_max", 2.0)
        flood_diff_min = cfg.get("flood_diff_min", 5.0)
        flood_diff_max = cfg.get("flood_diff_max", 200.0)
        flood_ratio_max = cfg.get("flood_ratio_max", 5.0)

        gap_tiers = cfg.get("gap_tiers", {
            "info": [1.5, 2.0],
            "general": [2.0, 3.0],
            "warning": [3.0, 5.0],
            "severe": 5.0,
        })

        if "year" not in data.columns or "month" not in data.columns:
            return []

        monthly = data[data["month"].notna()].copy()
        if monthly.empty:
            return []

        results = []
        for (year, month), grp in monthly.groupby(["year", "month"]):
            station_values = dict(zip(grp["station_id"], grp["precipitation"]))
            if len(station_values) < 2:
                continue

            is_flood = int(month) in flood_months
            is_non_flood = int(month) in non_flood_months

            positives = {k: v for k, v in station_values.items() if v > 0}
            if len(positives) < 2:
                continue

            max_val = max(positives.values())
            min_val = min(positives.values())
            abs_diff = max_val - min_val
            ratio = max_val / min_val if min_val > 0 else float("inf")
            season = "汛期" if is_flood else "非汛期"
            season_months_str = f"{year}-{int(month):02d}"

            max_station = max(positives, key=positives.get)
            min_station = min(positives, key=positives.get)

            if is_flood:
                ratio_abnormal = ratio > flood_ratio_max and ratio != float("inf")
                diff_abnormal = abs_diff > flood_diff_max or abs_diff < flood_diff_min

                if ratio_abnormal or diff_abnormal:
                    triggers = []
                    if ratio_abnormal:
                        triggers.append(f"倍数比={ratio:.1f}>{flood_ratio_max}")
                    if diff_abnormal:
                        if abs_diff > flood_diff_max:
                            triggers.append(f"差值={abs_diff:.1f}>{flood_diff_max}mm(过大)")
                        else:
                            triggers.append(f"差值={abs_diff:.1f}<{flood_diff_min}mm(过小)")

                    level = "Warning"

                    results.append(self._result(
                        station_id=str(max_station),
                        datetime_val=season_months_str,
                        value=float(max_val),
                        trigger_rule=f"{season}月降水异常：" + "，".join(triggers),
                        flag_level=level,
                        expected_value=float(sum(positives.values()) / len(positives)),
                        deviation=float(ratio),
                        detail=f"最大站={max_station}({max_val:.1f}mm)，最小站={min_station}({min_val:.1f}mm)，差值={abs_diff:.1f}mm，倍率={ratio:.1f}",
                    ))

            elif is_non_flood:
                ratio_abnormal = ratio > non_flood_ratio_max and ratio != float("inf")
                diff_abnormal = abs_diff > non_flood_diff_max

                if ratio_abnormal or diff_abnormal:
                    triggers = []
                    if ratio_abnormal:
                        triggers.append(f"倍数比={ratio:.1f}>{non_flood_ratio_max}")
                    if diff_abnormal:
                        triggers.append(f"差值={abs_diff:.1f}>{non_flood_diff_max}mm")

                    level = "Warning"

                    results.append(self._result(
                        station_id=str(max_station),
                        datetime_val=season_months_str,
                        value=float(max_val),
                        trigger_rule=f"{season}月降水异常：" + "，".join(triggers),
                        flag_level=level,
                        expected_value=float(sum(positives.values()) / len(positives)),
                        deviation=float(ratio),
                        detail=f"最大站={max_station}({max_val:.1f}mm)，最小站={min_station}({min_val:.1f}mm)，差值={abs_diff:.1f}mm，倍率={ratio:.1f}",
                    ))

            else:
                if ratio > 2.0 and abs_diff > 10.0:
                    results.append(self._result(
                        station_id=str(max_station),
                        datetime_val=season_months_str,
                        value=float(max_val),
                        trigger_rule=f"月降水跨站差异过大：差值={abs_diff:.1f}mm，倍率={ratio:.1f}",
                        flag_level="General",
                        expected_value=float(sum(positives.values()) / len(positives)),
                        deviation=float(ratio),
                        detail=f"最大站={max_station}({max_val:.1f}mm)，最小站={min_station}({min_val:.1f}mm)",
                    ))

        return results


class YearlyComparisonDetector(BaseDetector):
    name = "YearlyComparisonDetector"
    data_type = "monthly"

    def detect(
        self,
        data: pd.DataFrame,
        stations: list[dict],
        config: dict,
    ) -> list[DetectionResult]:
        cfg = config.get("detection", {}).get("yearly_comparison", {})
        if not cfg.get("enabled", True):
            return []

        precip_ratio_max = cfg.get("precip_ratio_max", 2.0)
        days_ratio_max = cfg.get("days_ratio_max", 2.0)
        precip_diff_min = cfg.get("precip_diff_min", 100.0)
        days_diff_min = cfg.get("days_diff_min", 10)

        if "year" not in data.columns:
            return []

        monthly = data[data["month"].notna()].copy()
        if monthly.empty:
            return []

        yearly_precip = monthly.groupby(["station_id", "year"])["precipitation"].sum().reset_index()
        yearly_precip.columns = ["station_id", "year", "total_precip"]
        yearly_days = monthly.groupby(["station_id", "year"])["precip_days"].sum().reset_index()
        yearly_days.columns = ["station_id", "year", "total_days"]

        yearly = yearly_precip.merge(yearly_days, on=["station_id", "year"], how="outer").fillna(0)

        results = []
        for year, grp in yearly.groupby("year"):
            precip_map = dict(zip(grp["station_id"], grp["total_precip"]))
            days_map = dict(zip(grp["station_id"], grp["total_days"]))

            if len(precip_map) < 2:
                continue

            precip_pos = {k: v for k, v in precip_map.items() if v > 0}
            days_pos = {k: v for k, v in days_map.items() if v > 0}

            precip_ratio = max(precip_pos.values()) / min(precip_pos.values()) if len(precip_pos) >= 2 and min(precip_pos.values()) > 0 else 1
            days_ratio = max(days_pos.values()) / min(days_pos.values()) if len(days_pos) >= 2 and min(days_pos.values()) > 0 else 1

            precip_diff = max(precip_pos.values()) - min(precip_pos.values()) if len(precip_pos) >= 2 else 0
            days_diff = max(days_pos.values()) - min(days_pos.values()) if len(days_pos) >= 2 else 0

            precip_abnormal = precip_ratio > precip_ratio_max and precip_diff > precip_diff_min
            days_abnormal = days_ratio > days_ratio_max and days_diff > days_diff_min

            if precip_abnormal and days_abnormal:
                level = "General"
                detail = f"年降水量倍数比={precip_ratio:.1f}>{precip_ratio_max}(差值={precip_diff:.0f}mm)，年降水日数倍数比={days_ratio:.1f}>{days_ratio_max}(差值={days_diff:.0f}天)，两者均异常"
            elif precip_abnormal != days_abnormal:
                level = "Warning"
                if precip_abnormal:
                    detail = f"年降水量倍数比={precip_ratio:.1f}>{precip_ratio_max}(差值={precip_diff:.0f}mm)，降水日数正常"
                else:
                    detail = f"年降水日数倍数比={days_ratio:.1f}>{days_ratio_max}(差值={days_diff:.0f}天)，降水量正常"
            else:
                continue

            for sid in precip_map:
                results.append(self._result(
                    station_id=str(sid),
                    datetime_val=str(int(year)),
                    value=float(precip_map.get(sid, 0)),
                    trigger_rule="年降水/降水日数联合检查",
                    flag_level=level,
                    expected_value=None,
                    deviation=float(max(precip_ratio, days_ratio)),
                    detail=detail,
                ))

        return results
