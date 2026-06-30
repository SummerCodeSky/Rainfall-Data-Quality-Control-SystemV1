import numpy as np
import pandas as pd

from services.detection.base import BaseDetector
from models.station import DetectionResult


class ClimateExtremeDetector(BaseDetector):
    name = "ClimateExtremeDetector"
    data_type = "excerpt"

    def detect(
        self,
        data: pd.DataFrame,
        stations: list[dict],
        config: dict,
    ) -> list[DetectionResult]:
        cfg = config.get("detection", {}).get("climate_extreme", {})
        if not cfg.get("enabled", True):
            return []

        hourly_max = cfg.get("hourly_max", 150.0)
        percentile = cfg.get("percentile", 99.9)
        station_limits = cfg.get("station_limits", {})

        results = []
        for station_id, grp in data.groupby("station_id"):
            grp = grp.sort_values("datetime").reset_index(drop=True)
            station_id_str = str(station_id)

            station_hourly_max = station_limits.get(station_id_str, {}).get("hourly_max", hourly_max)
            station_daily_max = station_limits.get(station_id_str, {}).get("daily_max")

            for _, row in grp.iterrows():
                if row["precipitation"] > station_hourly_max:
                    results.append(self._result(
                        station_id=station_id_str,
                        datetime_val=str(row["datetime"]),
                        value=float(row["precipitation"]),
                        trigger_rule=f"时雨量>{station_hourly_max}mm",
                        flag_level="Warning",
                        expected_value=station_hourly_max,
                        deviation=float(row["precipitation"] - station_hourly_max),
                        detail=f"超时雨量上限{station_hourly_max}mm",
                    ))

            if station_daily_max is not None:
                grp["date"] = pd.to_datetime(grp["datetime"]).dt.date
                daily_sums = grp.groupby("date")["precipitation"].sum().reset_index()
                for _, row in daily_sums.iterrows():
                    if row["precipitation"] > station_daily_max:
                        results.append(self._result(
                            station_id=station_id_str,
                            datetime_val=str(row["date"]),
                            value=float(row["precipitation"]),
                            trigger_rule=f"日雨量>{station_daily_max}mm",
                            flag_level="Warning",
                            expected_value=float(station_daily_max),
                            deviation=float(row["precipitation"] - station_daily_max),
                            detail=f"超日雨量上限{station_daily_max}mm",
                        ))

            if len(grp) >= 100:
                p99_9 = np.percentile(grp["precipitation"].values, percentile)
                for _, row in grp.iterrows():
                    if row["precipitation"] > p99_9:
                        date_key = str(pd.to_datetime(row["datetime"]).date())
                        flagged = any(
                            r.station_id == station_id_str and r.datetime.startswith(date_key) and r.detector == self.name
                            for r in results
                        )
                        if not flagged:
                            results.append(self._result(
                                station_id=station_id_str,
                                datetime_val=str(row["datetime"]),
                                value=float(row["precipitation"]),
                                trigger_rule=f"超过P{percentile}(={p99_9:.1f}mm)",
                                flag_level="Info",
                                expected_value=float(p99_9),
                                detail=f"P{percentile}极端值，建议人工复核",
                            ))

        return results
