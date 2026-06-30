import pandas as pd
from pathlib import Path
from typing import Optional

STATION_PREFIX = "RegionalStation"


def _normalize_station_id(sid: str) -> str:
    if sid.startswith(STATION_PREFIX):
        return sid[len(STATION_PREFIX):]
    return sid


COLUMN_MAPPINGS = {
    "excerpt": {
        "station": ["station_id", "站点", "站号", "站名", "station", "id"],
        "datetime": ["datetime", "时间", "时段", "日期时间", "time", "date"],
        "precipitation": ["precipitation", "降雨量", "降水量", "雨量", "precip", "value", "p"],
    },
    "daily": {
        "station": ["station_id", "站点", "站号", "站名", "station", "id"],
        "date": ["date", "日期", "date", "day"],
        "precipitation": ["precipitation", "降雨量", "降水量", "雨量", "precip", "value", "p"],
        "is_snow": ["is_snow", "降雪", "雪", "snow"],
    },
    "monthly": {
        "station": ["station_id", "站点", "站号", "站名", "station", "id"],
        "year": ["year", "年份", "年"],
        "month": ["month", "月份", "月"],
        "precipitation": ["precipitation", "降雨量", "降水量", "雨量", "precip", "value", "p"],
        "precip_days": ["precip_days", "降水日数", "雨日", "days", "日数"],
    },
    "period_max": {
        "station": ["station_id", "站点", "站号", "站名", "station", "id"],
        "period_type": ["period_type", "时段类型", "时段", "period", "type"],
        "max_value": ["max_value", "最大降水量", "最大值", "max", "value"],
    },
}


def _find_column(df: pd.DataFrame, candidates: list[str]) -> Optional[str]:
    for col in df.columns:
        col_lower = str(col).strip().lower()
        for candidate in candidates:
            if candidate.lower() == col_lower or candidate in col:
                return col
    return None


def _read_file(file_path: str) -> pd.DataFrame:
    path = Path(file_path)
    if path.suffix.lower() == ".csv":
        return pd.read_csv(file_path)
    else:
        return pd.read_excel(file_path)


def _extract_station_from_filename(file_path: str) -> str:
    import re
    name = Path(file_path).stem
    m = re.match(r'^(.+?)站', name)
    if m:
        return m.group(1)
    m = re.match(r'^(.+?)降水量', name)
    if m:
        return m.group(1)
    return "unknown"


def _parse_wide_excerpt(file_path: str) -> pd.DataFrame:
    import re
    df = _read_file(file_path)
    columns = [str(c).strip() for c in df.columns]

    month_cols = [c for c in columns if re.search(r'^月份', c)]
    precip_cols = [c for c in columns if re.search(r'降水量', c)]
    day_cols = [c for c in columns if re.search(r'^日期', c)]
    start_hour_cols = [c for c in columns if re.search(r'起时分', c)]

    if not month_cols or not precip_cols:
        return _empty_excerpt_result()

    n_sets = len(precip_cols)
    station_name = _extract_station_from_filename(file_path)
    rows = []

    year = 2026

    for _, row in df.iterrows():
        for i in range(n_sets):
            mcol = month_cols[min(i, len(month_cols) - 1)]
            pcol = precip_cols[min(i, len(precip_cols) - 1)]
            dcol = day_cols[min(i, len(day_cols) - 1)] if day_cols else None
            hcol = start_hour_cols[min(i, len(start_hour_cols) - 1)] if start_hour_cols else None

            month_val = pd.to_numeric(row.get(mcol), errors="coerce")
            precip_val = pd.to_numeric(row.get(pcol), errors="coerce")
            day_val = pd.to_numeric(row.get(dcol), errors="coerce") if dcol else pd.NA
            hour_val = row.get(hcol) if hcol else None

            if pd.isna(month_val) or pd.isna(precip_val) or precip_val <= 0:
                continue
            if month_val < 1 or month_val > 12:
                continue

            month_int = int(month_val)
            day_int = int(day_val) if not pd.isna(day_val) and 1 <= day_val <= 31 else 15

            hour_str = str(int(hour_val)) if not pd.isna(hour_val) else "0"
            if hour_val is not None:
                try:
                    hour_int = int(float(str(hour_val)))
                except (ValueError, TypeError):
                    hour_int = 0
            else:
                hour_int = 0

            try:
                dt_str = f"{year}-{month_int:02d}-{day_int:02d} {hour_int:02d}:00:00"
                dt = pd.Timestamp(dt_str)
            except Exception:
                continue

            rows.append({
                "station_id": station_name,
                "datetime": dt,
                "precipitation": float(precip_val),
            })

    if not rows:
        return _empty_excerpt_result()
    return pd.DataFrame(rows)


def _empty_excerpt_result() -> pd.DataFrame:
    return pd.DataFrame(columns=["station_id", "datetime", "precipitation"])


def parse_excerpt_table(file_path: str) -> pd.DataFrame:
    df = _read_file(file_path)
    mapping = COLUMN_MAPPINGS["excerpt"]

    station_col = _find_column(df, mapping["station"])
    datetime_col = _find_column(df, mapping["datetime"])
    precip_col = _find_column(df, mapping["precipitation"])

    sid = df[station_col].astype(str) if station_col else pd.Series("unknown", index=df.index)
    dt = pd.to_datetime(df[datetime_col]) if datetime_col else pd.Series(pd.NaT, index=df.index)
    precip = pd.to_numeric(df[precip_col], errors="coerce").fillna(0.0) if precip_col else 0.0

    result = pd.DataFrame({
        "station_id": sid.apply(_normalize_station_id),
        "datetime": dt,
        "precipitation": precip,
    }, index=df.index)

    result = result.dropna(subset=["datetime"])

    if len(result) == 0:
        wide = _parse_wide_excerpt(file_path)
        if len(wide) > 0:
            return wide

    return result


def parse_daily_table(file_path: str) -> pd.DataFrame:
    df = _read_file(file_path)
    mapping = COLUMN_MAPPINGS["daily"]

    station_col = _find_column(df, mapping["station"])
    date_col = _find_column(df, mapping["date"])
    precip_col = _find_column(df, mapping["precipitation"])
    snow_col = _find_column(df, mapping["is_snow"])

    sid = df[station_col].astype(str).apply(_normalize_station_id) if station_col else pd.Series("unknown", index=df.index)
    date_val = pd.to_datetime(df[date_col]).dt.date if date_col else pd.Series(pd.NaT, index=df.index)

    if precip_col:
        raw_values = df[precip_col].astype(str)
        is_snow = raw_values.str.contains(r"\*", na=False)
        precip_val = pd.to_numeric(
            raw_values.str.replace("*", "", regex=False), errors="coerce"
        ).fillna(0.0)
    else:
        precip_val = 0.0
        is_snow = False

    if snow_col and not precip_col:
        is_snow = df[snow_col].astype(str).str.lower().isin(["true", "1", "yes", "是"])

    result = pd.DataFrame({
        "station_id": sid,
        "date": date_val,
        "is_snow": is_snow,
        "precipitation": precip_val,
    }, index=df.index)

    return result.dropna(subset=["date"])


def parse_monthly_table(file_path: str) -> pd.DataFrame:
    df = _read_file(file_path)
    mapping = COLUMN_MAPPINGS["monthly"]

    station_col = _find_column(df, mapping["station"])
    year_col = _find_column(df, mapping["year"])
    month_col = _find_column(df, mapping["month"])
    precip_col = _find_column(df, mapping["precipitation"])
    days_col = _find_column(df, mapping["precip_days"])

    sid = df[station_col].astype(str).apply(_normalize_station_id) if station_col else pd.Series("unknown", index=df.index)
    year_val = pd.to_numeric(df[year_col], errors="coerce").astype("Int64") if year_col else pd.NA
    month_val = pd.to_numeric(df[month_col], errors="coerce").astype("Int64") if month_col else pd.NA
    precip_val = pd.to_numeric(df[precip_col], errors="coerce").fillna(0.0) if precip_col else 0.0
    days_val = pd.to_numeric(df[days_col], errors="coerce").fillna(0).astype(int) if days_col else 0

    result = pd.DataFrame({
        "station_id": sid,
        "year": year_val,
        "month": month_val,
        "precipitation": precip_val,
        "precip_days": days_val,
    }, index=df.index)

    return result.dropna(subset=["year"])


def parse_period_max_table(file_path: str) -> pd.DataFrame:
    df = _read_file(file_path)
    mapping = COLUMN_MAPPINGS["period_max"]

    station_col = _find_column(df, mapping["station"])
    period_col = _find_column(df, mapping["period_type"])
    max_col = _find_column(df, mapping["max_value"])

    station_id_raw = df[station_col].astype(str) if station_col else pd.Series("unknown", index=df.index)
    result = pd.DataFrame({"station_id": station_id_raw}, index=df.index)
    result["station_id"] = result["station_id"].apply(_normalize_station_id)
    result["period_type"] = df[period_col].astype(str) if period_col else "unknown"
    result["max_value"] = pd.to_numeric(df[max_col], errors="coerce").fillna(0.0) if max_col else 0.0

    return result
