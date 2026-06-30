import yaml
import pandas as pd
from pathlib import Path
from typing import Optional

from services.parser import (
    parse_excerpt_table,
    parse_daily_table,
    parse_monthly_table,
    parse_period_max_table,
)
from services.file_scanner import (
    scan_region_files,
    FileCategory,
    RegionFile,
)


class RegionData:
    def __init__(
        self,
        name: str,
        stations: list[dict],
        tables: dict[str, pd.DataFrame],
        files: list[RegionFile] | None = None,
    ):
        self.name = name
        self.stations = stations
        self.tables = tables
        self.files = files or []


PARSER_MAP = {
    FileCategory.EXCERPT: parse_excerpt_table,
    FileCategory.DAILY: parse_daily_table,
    FileCategory.MONTHLY_YEARLY: parse_monthly_table,
    FileCategory.PERIOD_MAX: parse_period_max_table,
}


def _parse_file(file_path: str, category: FileCategory) -> Optional[pd.DataFrame]:
    parser = PARSER_MAP.get(category)
    if parser is None:
        return None
    try:
        df = parser(file_path)
        return df
    except Exception as e:
        print(f"  [WARN] Failed to parse {file_path}: {e}")
        return None


def load_region(region_dir: str) -> Optional[RegionData]:
    path = Path(region_dir)
    if not path.is_dir():
        return None

    yaml_file = path / "stations.yaml"
    if not yaml_file.exists():
        yaml_file = path / "station.yaml"

    if not yaml_file.exists():
        stations = []
    else:
        with open(yaml_file, "r", encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}

        if isinstance(raw, list):
            stations = raw
        elif isinstance(raw, dict):
            stations = [raw]
        else:
            stations = []

    for s in stations:
        s.setdefault("obs_type", "auto")

    region_files = scan_region_files(str(path))

    station_names_from_yaml = {s.get("name", "") for s in stations}

    for rf in region_files:
        if rf.station_name and rf.station_name not in station_names_from_yaml:
            stations.append({"name": rf.station_name, "obs_type": "auto"})
            station_names_from_yaml.add(rf.station_name)

    tables: dict[str, list[pd.DataFrame]] = {}
    for rf in region_files:
        df = _parse_file(rf.file_path, rf.category)
        if df is not None and len(df) > 0:
            tables.setdefault(rf.category.value, []).append(df)

    merged: dict[str, pd.DataFrame] = {}
    for cat, dfs in tables.items():
        if dfs:
            merged[cat] = pd.concat(dfs, ignore_index=True)

    return RegionData(
        name=path.name,
        stations=stations,
        tables=merged,
        files=region_files,
    )


def load_all_regions(data_dir: str) -> list[RegionData]:
    root = Path(data_dir)
    if not root.is_dir():
        return []

    regions = []
    for subdir in sorted(root.iterdir()):
        if subdir.is_dir():
            rd = load_region(str(subdir))
            if rd is not None and rd.stations:
                regions.append(rd)

    return regions


def find_rainfall_events(values: list[float]) -> list[tuple[int, int]]:
    events = []
    start = None
    n = len(values)
    for i in range(n):
        if values[i] > 0 and start is None:
            start = i
        elif values[i] <= 0 and start is not None:
            events.append((start, i))
            start = None
    if start is not None:
        events.append((start, n))
    return events


def deduplicate_stations(regions: list[RegionData]) -> list[dict]:
    seen = {}
    result = []
    for region in regions:
        for s in region.stations:
            key = s.get("name", "")
            if key and key not in seen:
                seen[key] = True
                s_copy = dict(s)
                s_copy["region"] = region.name
                result.append(s_copy)
    return result
