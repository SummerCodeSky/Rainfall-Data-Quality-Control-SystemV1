import re
from enum import Enum
from dataclasses import dataclass, field
from pathlib import Path


class FileCategory(str, Enum):
    PERIOD_MAX = "period_max"
    MONTHLY_YEARLY = "monthly"
    DAILY = "daily"
    EXCERPT = "excerpt"


@dataclass
class RegionFile:
    category: FileCategory
    file_path: str
    file_name: str
    file_size: int
    month: int | None = None
    station_name: str | None = None


FILE_KEYWORDS: dict[FileCategory, list[str]] = {
    FileCategory.PERIOD_MAX: ["各时段最大降水量", "各时段最大", "时段最大", "period_max"],
    FileCategory.MONTHLY_YEARLY: ["各站月年降水量", "月年降水对照", "月年降水", "月年对照", "月年降水量"],
    FileCategory.DAILY: ["逐日降水量对照", "逐日降水", "逐日"],
    FileCategory.EXCERPT: ["降水量摘录表", "降雨摘录", "摘录"],
}

TABLE_EXTENSIONS = {".xlsx", ".xls", ".csv", ".xlsm"}

MONTH_NUMBERS: dict[str, int] = {
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6,
    "七": 7, "八": 8, "九": 9, "十": 10, "十一": 11, "十二": 12,
}

MONTH_DIGITS: dict[str, int] = {
    "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6,
    "7": 7, "8": 8, "9": 9, "10": 10, "11": 11, "12": 12,
}

MAX_EXCERPT_FILES = 200


def _match_category(filename: str) -> FileCategory | None:
    stem = filename.lower()
    for cat in [FileCategory.PERIOD_MAX, FileCategory.MONTHLY_YEARLY, FileCategory.DAILY, FileCategory.EXCERPT]:
        for kw in FILE_KEYWORDS[cat]:
            if kw.lower() in stem:
                return cat
    return None


def _extract_month(filename: str) -> int | None:
    chinese_pat = re.compile(r'[（(](.{1,3})月[）)]')
    paren_pat = re.compile(r'[（(](.{1,3})[）)]')

    for pat in [chinese_pat, paren_pat]:
        m = pat.search(filename)
        if m:
            token = m.group(1).strip()
            if token.isdigit():
                num = int(token)
                if 1 <= num <= 12:
                    return num
            if token in MONTH_NUMBERS:
                return MONTH_NUMBERS[token]
            if token in MONTH_DIGITS:
                return MONTH_DIGITS[token]

    for name, num in MONTH_NUMBERS.items():
        if f"{name}月" in filename or f"（{name}）" in filename or f"({name})" in filename:
            return num
    return None


def _extract_station_name(filename: str) -> str | None:
    m = re.match(r'^(.+?)站.*降水量', filename)
    if m:
        return m.group(1)
    m = re.match(r'^(.+?)降水量摘录', filename)
    if m:
        return m.group(1)
    return None


def scan_region_files(region_dir: str) -> list[RegionFile]:
    path = Path(region_dir)
    if not path.is_dir():
        return []

    files: list[RegionFile] = []
    for f in sorted(path.iterdir()):
        if not f.is_file():
            continue
        if f.suffix.lower() not in TABLE_EXTENSIONS:
            continue

        category = _match_category(f.name)
        if category is None:
            continue

        rf = RegionFile(
            category=category,
            file_path=str(f),
            file_name=f.name,
            file_size=f.stat().st_size,
        )

        if category == FileCategory.DAILY:
            rf.month = _extract_month(f.name)

        if category == FileCategory.EXCERPT:
            rf.station_name = _extract_station_name(f.name)

        files.append(rf)

    return files


def group_files_by_category(files: list[RegionFile]) -> dict[str, list[RegionFile]]:
    grouped: dict[str, list[RegionFile]] = {}
    for rf in files:
        grouped.setdefault(rf.category.value, []).append(rf)
    return grouped
