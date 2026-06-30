from services.detection.base import BaseDetector, DetectorRegistry
from services.detection.persistent_trace import PersistentTraceDetector
from services.detection.stagnation import StagnationDetector
from services.detection.climate_extreme import ClimateExtremeDetector
from services.detection.jump_step import JumpStepDetector
from services.detection.cross_station import CrossStationComparator, PeriodMaxDetector
from services.detection.spatial_consistency import DailyCrossStationDetector, HumanErrorDetector
from services.detection.monthly_comparison import MonthlyComparisonDetector, YearlyComparisonDetector

DetectorRegistry.register(PersistentTraceDetector())
DetectorRegistry.register(StagnationDetector())
DetectorRegistry.register(ClimateExtremeDetector())
DetectorRegistry.register(JumpStepDetector())
DetectorRegistry.register(CrossStationComparator())
DetectorRegistry.register(DailyCrossStationDetector())
DetectorRegistry.register(HumanErrorDetector())
DetectorRegistry.register(MonthlyComparisonDetector())
DetectorRegistry.register(YearlyComparisonDetector())
DetectorRegistry.register(PeriodMaxDetector())
