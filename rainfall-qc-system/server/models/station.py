from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from enum import Enum


class ObsType(str, Enum):
    MANUAL = "manual"
    AUTO = "auto"


class FlagLevel(str, Enum):
    INFO = "Info"
    GENERAL = "General"
    WARNING = "Warning"
    SEVERE = "Severe"


class DataTableType(str, Enum):
    EXCERPT = "excerpt"
    DAILY = "daily"
    MONTHLY = "monthly"
    PERIOD_MAX = "period_max"


class Station(BaseModel):
    name: str = Field(..., description="站点名称")
    longitude: float = Field(..., description="经度")
    latitude: float = Field(..., description="纬度")
    elevation: float = Field(..., description="高程 (m)")
    obs_type: ObsType = Field(..., description="观测方式")


class RainfallExcerpt(BaseModel):
    station_id: str
    datetime: datetime
    precipitation: float


class DailyPrecipitation(BaseModel):
    station_id: str
    date: date
    precipitation: float
    is_snow: bool = False


class PeriodMax(BaseModel):
    station_id: str
    period_type: str
    max_value: float


class MonthlyYearly(BaseModel):
    station_id: str
    year: int
    month: Optional[int] = None
    precipitation: float
    precip_days: int


class DetectionResult(BaseModel):
    report_id: str = ""
    station_id: str
    detector: str
    data_type: str
    datetime: str
    value: float
    expected_value: Optional[float] = None
    deviation: Optional[float] = None
    trigger_rule: str
    flag_level: FlagLevel
    detail: str = ""


class Report(BaseModel):
    id: str
    station_name: str
    created_at: datetime
    total_flags: int = 0
    severe_count: int = 0
    warning_count: int = 0
    general_count: int = 0
    info_count: int = 0
    status: str = "completed"
