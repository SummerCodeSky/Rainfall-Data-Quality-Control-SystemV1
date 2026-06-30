import pandas as pd
import re
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


def _read_file_raw(file_path: str) -> pd.DataFrame:
    path = Path(file_path)
    if path.suffix.lower() == ".csv":
        return pd.read_csv(file_path, header=None)
    else:
        return pd.read_excel(file_path, header=None)


def _extract_station_from_filename(file_path: str) -> str:
    name = Path(file_path).stem
    m = re.match(r'^(.+?)站', name)
    if m:
        return m.group(1)
    m = re.match(r'^(.+?)降水量', name)
    if m:
        return m.group(1)
    return "unknown"


def _extract_year_from_filename(file_path: str) -> int:
    name = Path(file_path).stem
    m = re.search(r'(\d{4})', name)
    if m:
        y = int(m.group(1))
        if 2000 <= y <= 2100:
            return y
    return 2026


def _empty_excerpt_df() -> pd.DataFrame:
    return pd.DataFrame(columns=["station_id", "datetime", "precipitation", "month", "day", "starttime", "endtime"])


def _empty_daily_df() -> pd.DataFrame:
    return pd.DataFrame(columns=["station_id", "date", "precipitation", "is_snow"])


def _empty_period_max_df() -> pd.DataFrame:
    return pd.DataFrame(columns=["station_id", "period_type", "max_value", "month", "day"])


def _empty_monthly_df() -> pd.DataFrame:
    return pd.DataFrame(columns=["station_id", "year", "month", "precipitation", "precip_days"])


CHINESE_MONTH_MAP = {
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6,
    "七": 7, "八": 8, "九": 9, "十": 10, "十一": 11, "十二": 12,
}

MONTH_NAMES = [
    "一月", "二月", "三月", "四月", "五月", "六月",
    "七月", "八月", "九月", "十月", "十一月", "十二月",
]


# ============================================================================
# 降雨摘录表解析 (Wide format: [月份, 日期, 起时分, 止时分, 降水量] × N)
# ============================================================================

def _parse_wide_excerpt(file_path: str) -> pd.DataFrame:
    raw = _read_file_raw(file_path)
    if raw.empty:
        return _empty_excerpt_df()

    header_row = raw.iloc[0].astype(str).str.strip()
    columns = header_row.tolist()

    month_cols = [i for i, c in enumerate(columns) if c == "月份"]
    precip_cols = [i for i, c in enumerate(columns) if "降水量" in c]
    day_cols = [i for i, c in enumerate(columns) if c == "日期"]
    start_hour_cols = [i for i, c in enumerate(columns) if c == "起时分"]
    end_hour_cols = [i for i, c in enumerate(columns) if c == "止时分"]

    if not month_cols or not precip_cols:
        return _empty_excerpt_df()

    n_sets = len(precip_cols)
    station_name = _extract_station_from_filename(file_path)
    year = _extract_year_from_filename(file_path)
    rows = []

    for _, row in raw.iloc[1:].iterrows():
        for i in range(n_sets):
            mcol = month_cols[min(i, len(month_cols) - 1)]
            pcol = precip_cols[min(i, len(precip_cols) - 1)]
            dcol = day_cols[min(i, len(day_cols) - 1)] if day_cols else None
            shcol = start_hour_cols[min(i, len(start_hour_cols) - 1)] if start_hour_cols else None
            ehcol = end_hour_cols[min(i, len(end_hour_cols) - 1)] if end_hour_cols else None

            month_val = pd.to_numeric(row.iloc[mcol], errors="coerce")
            precip_val = pd.to_numeric(row.iloc[pcol], errors="coerce")
            day_val = pd.to_numeric(row.iloc[dcol], errors="coerce") if dcol is not None else pd.NA
            start_hour_val = pd.to_numeric(row.iloc[shcol], errors="coerce") if shcol is not None else pd.NA
            end_hour_val = pd.to_numeric(row.iloc[ehcol], errors="coerce") if ehcol is not None else pd.NA

            if pd.isna(month_val) or pd.isna(precip_val) or precip_val <= 0:
                continue
            if month_val < 1 or month_val > 12:
                continue

            month_int = int(month_val)
            day_int = int(day_val) if not pd.isna(day_val) and 1 <= day_val <= 31 else 15
            sh_int = int(start_hour_val) if not pd.isna(start_hour_val) else 0
            eh_int = int(end_hour_val) if not pd.isna(end_hour_val) else 0

            try:
                dt_str = f"{year}-{month_int:02d}-{day_int:02d} {sh_int:02d}:00:00"
                dt = pd.Timestamp(dt_str)
            except Exception:
                continue

            rows.append({
                "station_id": station_name,
                "month": month_int,
                "day": day_int,
                "starttime": str(sh_int),
                "endtime": str(eh_int),
                "datetime": dt,
                "precipitation": float(precip_val),
            })

    if not rows:
        return _empty_excerpt_df()
    return pd.DataFrame(rows)


# ============================================================================
# 逐日降水表解析 (Wide format: stations as columns, dates as rows)
# ============================================================================

def _is_daily_summary_row(label: str) -> bool:
    label = str(label).strip().replace(" ", "").replace("\u3000", "")
    for kw in ["月降水量", "降水日数", "最大日量", "最大日降水量", "月降水", "月合计", "合计"]:
        if kw in label:
            return True
    return False


def _parse_wide_daily(file_path: str) -> pd.DataFrame:
    raw = _read_file_raw(file_path)
    if raw.empty or raw.shape[0] < 4:
        return _empty_daily_df()

    year = _extract_year_from_filename(file_path)
    month = _extract_month_from_filename(file_path)

    station_row_idx = None
    data_start_row = None
    station_cols = {}

    for ri in range(raw.shape[0]):
        row_strs = []
        for ci in range(raw.shape[1]):
            s = str(raw.iloc[ri, ci]).strip()
            s = re.sub(r'\s+', '', s)
            row_strs.append(s)
        if any("站名" in s for s in row_strs):
            station_row_idx = ri
            break

    if station_row_idx is None:
        return _empty_daily_df()

    for ci in range(1, raw.shape[1]):
        v = str(raw.iloc[station_row_idx, ci]).strip()
        if v and v not in ("nan", "NaN", "") and not v.startswith("Unnamed"):
            station_cols[ci] = v

    if not station_cols:
        return _empty_daily_df()

    for ri in range(station_row_idx + 1, raw.shape[0]):
        first_val = str(raw.iloc[ri, 0]).strip() if raw.shape[1] > 0 else ""
        first_val_clean = first_val.replace(" ", "").replace("\u3000", "")
        if not first_val_clean or first_val_clean in ("nan", "NaN"):
            continue
        if _is_daily_summary_row(first_val_clean):
            continue
        try:
            day = int(float(first_val_clean))
        except (ValueError, TypeError):
            continue
        if day < 1 or day > 31:
            continue

        data_start_row = ri
        break

    if data_start_row is None:
        return _empty_daily_df()

    rows = []
    for ri in range(data_start_row, raw.shape[0]):
        first_val = str(raw.iloc[ri, 0]).strip() if raw.shape[1] > 0 else ""
        first_val_clean = first_val.replace(" ", "").replace("\u3000", "")
        if not first_val_clean or first_val_clean in ("nan", "NaN"):
            continue
        if _is_daily_summary_row(first_val_clean):
            continue
        try:
            day = int(float(first_val_clean))
        except (ValueError, TypeError):
            continue
        if day < 1 or day > 31:
            continue

        for col_idx, station_name in station_cols.items():
            if col_idx >= raw.shape[1]:
                continue
            cell_raw = raw.iloc[ri, col_idx]
            cell_str = str(cell_raw).strip() if pd.notna(cell_raw) else ""

            if not cell_str or cell_str in ("nan", "NaN", ""):
                continue

            is_snow = "*" in cell_str
            cleaned = cell_str.replace("*", "").replace(" ", "")
            try:
                precip = float(cleaned)
            except (ValueError, TypeError):
                continue

            try:
                m = month or 1
                date_obj = pd.Timestamp(year=year, month=m, day=day).date()
            except Exception:
                continue

            rows.append({
                "station_id": _normalize_station_id(station_name),
                "date": date_obj,
                "precipitation": precip,
                "is_snow": is_snow,
            })

    if not rows:
        return _empty_daily_df()
    return pd.DataFrame(rows)


def _extract_month_from_filename(file_path: str) -> Optional[int]:
    name = Path(file_path).stem
    for num in range(1, 13):
        if f"{num}月" in name or f"（{num}）" in name or f"({num})" in name:
            return num
    for ch, num in CHINESE_MONTH_MAP.items():
        if f"{ch}月" in name or f"（{ch}）" in name or f"({ch})" in name:
            return num
    return None


# ============================================================================
# 各时段最大降水量表解析 (Wide format with complex merged headers)
# ============================================================================

def _parse_wide_period_max(file_path: str) -> pd.DataFrame:
    raw = _read_file_raw(file_path)
    if raw.empty or raw.shape[0] < 6:
        return _empty_period_max_df()

    period_row_idx = None
    station_col_idx = 2
    data_start_row = None

    for ri in range(raw.shape[0]):
        row_strs = []
        for ci in range(raw.shape[1]):
            s = str(raw.iloc[ri, ci]).strip()
            s = re.sub(r'\s+', '', s)
            row_strs.append(s)
        joined = "".join(row_strs)
        if "站次" in joined or "站名" in joined:
            station_col_idx = 2
            period_row_idx = ri + 1
            data_start_row = ri + 4
            break

    if period_row_idx is None:
        return _empty_period_max_df()

    period_cols = {}
    for ci in range(raw.shape[1]):
        v = str(raw.iloc[period_row_idx, ci]).strip() if pd.notna(raw.iloc[period_row_idx, ci]) else ""
        try:
            period_type = int(float(v))
            if period_type in (1, 2, 3, 6, 12, 24, 48, 72) and ci > 2:
                period_cols[ci] = f"{period_type}h"
        except (ValueError, TypeError):
            pass

    if not period_cols:
        return _empty_period_max_df()

    if data_start_row is None:
        data_start_row = period_row_idx + 3

    rows = []
    for ri in range(data_start_row, raw.shape[0]):
        station_name_raw = str(raw.iloc[ri, station_col_idx]).strip() if raw.shape[1] > station_col_idx else ""
        if not station_name_raw or station_name_raw in ("nan", "NaN", ""):
            continue

        first_cell = str(raw.iloc[ri, 0]).strip() if raw.shape[1] > 0 else ""
        try:
            int(float(first_cell))
        except (ValueError, TypeError):
            continue

        for ci, period_type in sorted(period_cols.items()):
            precip_val = pd.to_numeric(raw.iloc[ri, ci], errors="coerce")
            month_val_raw = raw.iloc[ri, ci + 1] if ci + 1 < raw.shape[1] else None
            day_val_raw = raw.iloc[ri, ci + 2] if ci + 2 < raw.shape[1] else None

            if pd.isna(precip_val) or precip_val <= 0:
                continue

            month_val = int(pd.to_numeric(month_val_raw, errors="coerce")) if pd.notna(pd.to_numeric(month_val_raw, errors="coerce")) else None
            day_val = int(pd.to_numeric(day_val_raw, errors="coerce")) if pd.notna(pd.to_numeric(day_val_raw, errors="coerce")) else None

            rows.append({
                "station_id": _normalize_station_id(station_name_raw),
                "period_type": period_type,
                "max_value": float(precip_val),
                "month": month_val,
                "day": day_val,
            })

    if not rows:
        return _empty_period_max_df()
    return pd.DataFrame(rows)


# ============================================================================
# 月年降水对照表解析 (Wide format: paired rows per station)
# ============================================================================

def _parse_wide_monthly(file_path: str) -> pd.DataFrame:
    raw = _read_file_raw(file_path)
    if raw.empty or raw.shape[0] < 4:
        return _empty_monthly_df()

    year = _extract_year_from_filename(file_path)
    header_row_idx = None
    station_name_col = 2

    for ri in range(raw.shape[0]):
        row_strs = []
        for ci in range(raw.shape[1]):
            s = str(raw.iloc[ri, ci]).strip()
            s = re.sub(r'\s+', '', s)
            row_strs.append(s)
        for ci, v in enumerate(row_strs):
            if v in ("站名", "站次") or ("站" in v and "名" in v):
                station_name_col = ci if "名" in v else 2
                header_row_idx = ri
                break
        if header_row_idx is not None:
            break

    if header_row_idx is None:
        return _empty_monthly_df()

    data_start = header_row_idx + 1
    if data_start >= raw.shape[0]:
        return _empty_monthly_df()

    rows = []
    ri = data_start
    while ri < raw.shape[0]:
        station_name = str(raw.iloc[ri, station_name_col]).strip() if raw.shape[1] > station_name_col else ""
        if not station_name or station_name in ("nan", "NaN", ""):
            ri += 1
            continue

        first_cell = str(raw.iloc[ri, 0]).strip() if raw.shape[1] > 0 else ""
        try:
            int(float(first_cell))
        except (ValueError, TypeError):
            ri += 1
            continue

        item_type = str(raw.iloc[ri, station_name_col + 1]).strip() if raw.shape[1] > station_name_col + 1 else ""
        is_precip_row = "降水" in item_type and "日数" not in item_type

        monthly_precip = {}
        monthly_days = {}

        for mi in range(12):
            col = 4 + mi
            if col < raw.shape[1]:
                v = pd.to_numeric(raw.iloc[ri, col], errors="coerce")
                if not pd.isna(v):
                    if is_precip_row:
                        monthly_precip[mi + 1] = float(v)
                    else:
                        monthly_days[mi + 1] = int(v)

        if is_precip_row:
            next_ri = ri + 1
            if next_ri < raw.shape[0]:
                for mi in range(12):
                    col = 4 + mi
                    if col < raw.shape[1]:
                        v = pd.to_numeric(raw.iloc[next_ri, col], errors="coerce")
                        if not pd.isna(v):
                            monthly_days[mi + 1] = int(v)
            ri += 2
        else:
            ri += 1

        for month_num in range(1, 13):
            precip = monthly_precip.get(month_num, 0)
            days = monthly_days.get(month_num, 0)
            rows.append({
                "station_id": _normalize_station_id(station_name),
                "year": year,
                "month": month_num,
                "precipitation": precip,
                "precip_days": days,
            })

    if not rows:
        return _empty_monthly_df()
    return pd.DataFrame(rows)


# ============================================================================
# 公共解析入口
# ============================================================================

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
    wide = _parse_wide_daily(file_path)
    if len(wide) > 0:
        return wide

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
    wide = _parse_wide_monthly(file_path)
    if len(wide) > 0:
        return wide

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
    wide = _parse_wide_period_max(file_path)
    if len(wide) > 0:
        return wide

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
