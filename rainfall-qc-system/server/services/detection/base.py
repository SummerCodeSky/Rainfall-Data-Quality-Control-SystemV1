from abc import ABC, abstractmethod
from typing import Any

import pandas as pd

from models.station import DetectionResult, FlagLevel


class BaseDetector(ABC):
    name: str = ""
    data_type: str = ""

    @abstractmethod
    def detect(
        self,
        data: pd.DataFrame,
        stations: list[dict],
        config: dict,
    ) -> list[DetectionResult]:
        ...

    def _result(
        self,
        station_id: str,
        datetime_val: str,
        value: float,
        trigger_rule: str,
        flag_level: str,
        expected_value: float | None = None,
        deviation: float | None = None,
        detail: str = "",
    ) -> DetectionResult:
        return DetectionResult(
            station_id=station_id,
            detector=self.name,
            data_type=self.data_type,
            datetime=str(datetime_val),
            value=value,
            expected_value=expected_value,
            deviation=deviation,
            trigger_rule=trigger_rule,
            flag_level=FlagLevel(flag_level),
            detail=detail,
        )


class DetectorRegistry:
    _detectors: list[BaseDetector] = []

    @classmethod
    def register(cls, detector: BaseDetector) -> None:
        cls._detectors.append(detector)

    @classmethod
    def get_all(cls) -> list[BaseDetector]:
        return cls._detectors

    @classmethod
    def get_by_type(cls, data_type: str) -> list[BaseDetector]:
        return [d for d in cls._detectors if d.data_type == data_type]
