import pandas as pd

from services.detection.base import BaseDetector
from models.station import DetectionResult


def _gap_level(gap: float, tiers: dict) -> str | None:
    severe = tiers.get("severe")
    if isinstance(severe, (int, float)) and gap >= severe:
        return "Severe"
    for lvl in ["warning", "general", "info"]:
        tier = tiers.get(lvl)
        if isinstance(tier, list) and len(tier) == 2:
            if tier[0] <= gap < tier[1]:
                return lvl.capitalize()
    return None


class DailyCrossStationDetector(BaseDetector):
    name = "DailyCrossStationDetector"
    data_type = "daily"

    def detect(
        self,
        data: pd.DataFrame,
        stations: list[dict],
        config: dict,
    ) -> list[DetectionResult]:
        cfg = config.get("detection", {}).get("daily_cross_station", {})
        if not cfg.get("enabled", True):
            return []

        gap_tiers = cfg.get("gap_tiers", {
            "info": [2.0, 5.0],
            "general": [5.0, 10.0],
            "warning": [10.0, 20.0],
            "severe": 20.0,
        })
        outlier_small_factor = cfg.get("outlier_small_factor", 0.05)
        outlier_large_factor = cfg.get("outlier_large_factor", 3.0)
        micro_threshold = cfg.get("micro_threshold", 0.2)
        neighbor_dry_threshold = cfg.get("neighbor_dry_threshold", 0.2)

        if "date" not in data.columns:
            return []

        station_ids = data["station_id"].unique()
        if len(station_ids) < 2:
            return []

        results = []

        for date_val, grp in data.groupby("date"):
            station_values = dict(zip(grp["station_id"], grp["precipitation"]))
            is_snow = dict(zip(grp["station_id"], grp.get("is_snow", [False] * len(grp))))

            if len(station_values) < 2:
                continue

            values_list = list(station_values.values())
            station_mean = sum(values_list) / len(values_list)

            for sid, precip in station_values.items():
                others = {k: v for k, v in station_values.items() if k != sid}
                if not others:
                    continue

                other_mean = sum(others.values()) / len(others)
                other_min = min(others.values())
                other_max = max(others.values())

                snow_flag = "（雪）" if is_snow.get(sid, False) else ""
                has_rain = precip > 0

                # Scenario (1): all other stations have rain, this one is dry
                if not has_rain and other_min > 0:
                    gap = other_mean - 0
                    level = _gap_level(gap, gap_tiers)
                    if level:
                        results.append(self._result(
                            station_id=str(sid),
                            datetime_val=str(date_val),
                            value=0.0,
                            trigger_rule=f"邻站均有雨{snow_flag}，本站无雨，差距={gap:.1f}mm",
                            flag_level=level,
                            expected_value=float(other_mean),
                            deviation=float(gap),
                            detail=f"邻站均值={other_mean:.1f}mm，邻站范围={other_min:.1f}~{other_max:.1f}mm",
                        ))
                    continue

                # Scenario (2): other stations low/no rain, this station has significant rain
                all_others_dry = other_max < neighbor_dry_threshold
                if has_rain and all_others_dry and precip > micro_threshold:
                    gap = precip - other_mean
                    level = _gap_level(gap, gap_tiers)
                    if level:
                        results.append(self._result(
                            station_id=str(sid),
                            datetime_val=str(date_val),
                            value=float(precip),
                            trigger_rule=f"邻站均无雨/微雨{snow_flag}，本站有雨={precip:.1f}mm，差距={gap:.1f}mm",
                            flag_level=level,
                            expected_value=float(other_mean),
                            deviation=float(gap),
                            detail=f"邻站均值={other_mean:.1f}mm，邻站最大值={other_max:.1f}mm",
                        ))
                    continue

                # Scenario (3): uniform distribution but one outlier
                if not has_rain or station_mean <= micro_threshold:
                    continue

                if precip < station_mean * outlier_small_factor:
                    gap = station_mean - precip
                    level = _gap_level(gap, gap_tiers)
                    if level:
                        results.append(self._result(
                            station_id=str(sid),
                            datetime_val=str(date_val),
                            value=float(precip),
                            trigger_rule=f"区域均匀分布{snow_flag}，本站异常偏小={precip:.1f}mm，差距={gap:.1f}mm",
                            flag_level=level,
                            expected_value=float(station_mean),
                            deviation=float(gap),
                            detail=f"区域均值={station_mean:.1f}mm，邻站范围={other_min:.1f}~{other_max:.1f}mm",
                        ))

                elif precip > station_mean * outlier_large_factor and precip - station_mean > micro_threshold:
                    gap = precip - station_mean
                    level = _gap_level(gap, gap_tiers)
                    if level:
                        results.append(self._result(
                            station_id=str(sid),
                            datetime_val=str(date_val),
                            value=float(precip),
                            trigger_rule=f"区域均匀分布{snow_flag}，本站异常偏大={precip:.1f}mm，差距={gap:.1f}mm",
                            flag_level=level,
                            expected_value=float(station_mean),
                            deviation=float(gap),
                            detail=f"区域均值={station_mean:.1f}mm，邻站范围={other_min:.1f}~{other_max:.1f}mm",
                        ))

        return results


class HumanErrorDetector(BaseDetector):
    name = "HumanErrorDetector"
    data_type = "daily"

    def detect(
        self,
        data: pd.DataFrame,
        stations: list[dict],
        config: dict,
    ) -> list[DetectionResult]:
        cfg = config.get("detection", {}).get("human_error", {})
        if not cfg.get("enabled", True):
            return []

        flood_months = cfg.get("flood_months", [5, 6, 7, 8, 9, 10])
        non_flood_months = cfg.get("non_flood_months", [1, 2, 3, 4, 11, 12])

        station_meta = {}
        for s in stations:
            name = s.get("name", "")
            if name:
                station_meta[name] = s

        results = []
        for station_id, grp in data.groupby("station_id"):
            station_id_str = str(station_id)
            meta = station_meta.get(station_id_str, {})
            obs_type = meta.get("obs_type", "auto")

            grp = grp.copy()
            if "date" not in grp.columns:
                continue

            grp["month"] = pd.to_datetime(grp["date"]).dt.month
            grp["is_flood"] = grp["month"].isin(flood_months)
            grp["is_non_flood"] = grp["month"].isin(non_flood_months)

            precip_positive = grp[grp["precipitation"] > 0]
            if len(precip_positive) == 0:
                continue

            precip_values = precip_positive["precipitation"]
            is_all_even = all(v % 2 == 0 for v in precip_values)
            has_odd = any(v % 2 == 1 for v in precip_values)

            non_flood = precip_positive[precip_positive["is_non_flood"]]
            flood = precip_positive[precip_positive["is_flood"]]

            if obs_type == "manual" and len(non_flood) > 0:
                non_flood_values = non_flood["precipitation"]
                if all(v % 2 == 0 for v in non_flood_values):
                    results.append(self._result(
                        station_id=station_id_str,
                        datetime_val=f"非汛期（{','.join(str(m) for m in non_flood_months)}月）",
                        value=0,
                        trigger_rule="非汛期人工观测降水全为偶数",
                        flag_level="General",
                        expected_value=None,
                        deviation=None,
                        detail="非汛期人工观测有效雨日降水量全部为偶数，疑似人工取偶错误",
                    ))

            if obs_type == "auto" and len(flood) > 0:
                flood_values = flood["precipitation"]
                if any(v % 2 == 1 for v in flood_values):
                    odd_dates = flood[pd.to_numeric(flood["precipitation"]) % 2 == 1]["date"]
                    results.append(self._result(
                        station_id=station_id_str,
                        datetime_val=f"汛期（{','.join(str(m) for m in flood_months)}月）",
                        value=0,
                        trigger_rule="汛期自动雨量站出现奇数降水量",
                        flag_level="General",
                        expected_value=None,
                        deviation=None,
                        detail=f"自动站汛期不应有奇数降水量，异常日期：{', '.join(str(d) for d in odd_dates.values)}",
                    ))

        return results
