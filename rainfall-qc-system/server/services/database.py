import sqlite3
import os
from pathlib import Path

DB_PATH = os.environ.get("QC_DB_PATH", os.path.join(os.path.dirname(__file__), "../../data/qc_results.db"))


def get_db() -> sqlite3.Connection:
    db_dir = Path(DB_PATH).parent
    db_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY,
            station_name TEXT,
            region_name TEXT DEFAULT '',
            created_at TEXT,
            total_flags INTEGER DEFAULT 0,
            severe_count INTEGER DEFAULT 0,
            warning_count INTEGER DEFAULT 0,
            general_count INTEGER DEFAULT 0,
            info_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'completed'
        );

        CREATE TABLE IF NOT EXISTS detection_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id TEXT REFERENCES reports(id) ON DELETE CASCADE,
            station_id TEXT,
            detector TEXT,
            data_type TEXT,
            datetime TEXT,
            value REAL,
            expected_value REAL,
            deviation REAL,
            trigger_rule TEXT,
            flag_level TEXT,
            detail TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_results_report ON detection_results(report_id);
        CREATE INDEX IF NOT EXISTS idx_results_station ON detection_results(station_id);
        CREATE INDEX IF NOT EXISTS idx_reports_station ON reports(station_name);
    """)
    conn.commit()
    conn.close()


def save_report(report: dict, results: list[dict]):
    conn = get_db()
    conn.execute(
        """INSERT OR REPLACE INTO reports
           (id, station_name, region_name, created_at, total_flags,
            severe_count, warning_count, general_count, info_count, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            report["id"],
            report.get("station_name", ""),
            report.get("region_name", ""),
            report.get("created_at", ""),
            report.get("total_flags", 0),
            report.get("severe_count", 0),
            report.get("warning_count", 0),
            report.get("general_count", 0),
            report.get("info_count", 0),
            report.get("status", "completed"),
        ),
    )
    conn.execute("DELETE FROM detection_results WHERE report_id = ?", (report["id"],))
    for r in results:
        conn.execute(
            """INSERT INTO detection_results
               (report_id, station_id, detector, data_type, datetime,
                value, expected_value, deviation, trigger_rule, flag_level, detail)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                report["id"],
                r.get("station_id", ""),
                r.get("detector", ""),
                r.get("data_type", ""),
                r.get("datetime", ""),
                r.get("value", 0),
                r.get("expected_value"),
                r.get("deviation"),
                r.get("trigger_rule", ""),
                r.get("flag_level", "Info"),
                r.get("detail", ""),
            ),
        )
    conn.commit()
    conn.close()


def list_reports() -> list[dict]:
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM reports ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_report(report_id: str) -> dict | None:
    conn = get_db()
    report = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    if not report:
        conn.close()
        return None
    results = conn.execute(
        "SELECT * FROM detection_results WHERE report_id = ?", (report_id,)
    ).fetchall()
    conn.close()
    rep_dict = dict(report)
    rep_dict["results"] = [dict(r) for r in results]
    return rep_dict


def get_results(
    report_id: str | None = None,
    station: str | None = None,
    flag_level: str | None = None,
    detector: str | None = None,
) -> list[dict]:
    conn = get_db()
    query = "SELECT * FROM detection_results WHERE 1=1"
    params: list = []
    if report_id:
        query += " AND report_id = ?"
        params.append(report_id)
    if station:
        query += " AND station_id = ?"
        params.append(station)
    if flag_level:
        query += " AND flag_level = ?"
        params.append(flag_level)
    if detector:
        query += " AND detector = ?"
        params.append(detector)
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_report(report_id: str) -> bool:
    conn = get_db()
    conn.execute("DELETE FROM detection_results WHERE report_id = ?", (report_id,))
    cursor = conn.execute("DELETE FROM reports WHERE id = ?", (report_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def delete_reports_by_ids(ids: list[str]) -> int:
    if not ids:
        return 0
    conn = get_db()
    placeholders = ",".join("?" for _ in ids)
    conn.execute(f"DELETE FROM detection_results WHERE report_id IN ({placeholders})", ids)
    cursor = conn.execute(f"DELETE FROM reports WHERE id IN ({placeholders})", ids)
    conn.commit()
    count = cursor.rowcount
    conn.close()
    return count


def delete_reports_by_batch(region_name: str, detect_time: str) -> int:
    conn = get_db()
    rows = conn.execute(
        "SELECT id FROM reports WHERE region_name = ? AND SUBSTR(created_at, 1, 19) = SUBSTR(?, 1, 19)",
        (region_name, detect_time),
    ).fetchall()
    ids = [r["id"] for r in rows]
    if not ids:
        conn.close()
        return 0
    placeholders = ",".join("?" for _ in ids)
    conn.execute(f"DELETE FROM detection_results WHERE report_id IN ({placeholders})", ids)
    cursor = conn.execute(f"DELETE FROM reports WHERE id IN ({placeholders})", ids)
    conn.commit()
    count = cursor.rowcount
    conn.close()
    return count


def query_reports(
    regions: list[str] | None = None,
    stations: list[str] | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
    risk_filter: str | None = None,
    batch_detect_time: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict], int]:
    conn = get_db()
    where_parts = ["1=1"]
    params: list = []

    if regions:
        placeholders = ",".join("?" for _ in regions)
        where_parts.append(f"region_name IN ({placeholders})")
        params.extend(regions)

    if stations:
        placeholders = ",".join("?" for _ in stations)
        where_parts.append(f"station_name IN ({placeholders})")
        params.extend(stations)

    if start_time:
        where_parts.append("created_at >= ?")
        params.append(start_time)

    if end_time:
        where_parts.append("created_at <= ?")
        params.append(end_time)

    if batch_detect_time:
        where_parts.append("SUBSTR(created_at, 1, 19) = SUBSTR(?, 1, 19)")
        params.append(batch_detect_time)

    if risk_filter == "severe_only":
        where_parts.append("severe_count > 0")
    elif risk_filter == "severe_warning":
        where_parts.append("(severe_count > 0 OR warning_count > 0)")

    where_clause = " AND ".join(where_parts)

    count_row = conn.execute(
        f"SELECT COUNT(*) as cnt FROM reports WHERE {where_clause}", params
    ).fetchone()
    total = count_row["cnt"] if count_row else 0

    offset = (page - 1) * page_size
    rows = conn.execute(
        f"SELECT * FROM reports WHERE {where_clause} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        params + [page_size, offset],
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows], total


def query_reports_grouped(
    regions: list[str] | None = None,
    stations: list[str] | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
    risk_filter: str | None = None,
    batch_detect_time: str | None = None,
    page: int = 1,
    page_size: int = 10,
) -> tuple[list[dict], int]:
    conn = get_db()
    where_parts = ["1=1"]
    params: list = []

    if regions:
        placeholders = ",".join("?" for _ in regions)
        where_parts.append(f"region_name IN ({placeholders})")
        params.extend(regions)

    if stations:
        placeholders = ",".join("?" for _ in stations)
        where_parts.append(f"station_name IN ({placeholders})")
        params.extend(stations)

    if start_time:
        where_parts.append("created_at >= ?")
        params.append(start_time)

    if end_time:
        where_parts.append("created_at <= ?")
        params.append(end_time)

    if batch_detect_time:
        where_parts.append("SUBSTR(created_at, 1, 19) = SUBSTR(?, 1, 19)")
        params.append(batch_detect_time)

    where_clause = " AND ".join(where_parts)

    group_query = f"""
        SELECT region_name, SUBSTR(created_at, 1, 19) as created_at,
               COUNT(*) as station_count,
               SUM(severe_count) as severe_count,
               SUM(warning_count) as warning_count,
               SUM(general_count) as general_count,
               SUM(info_count) as info_count,
               SUM(total_flags) as total_flags
        FROM reports
        WHERE {where_clause}
        GROUP BY region_name, SUBSTR(created_at, 1, 19)
    """

    if risk_filter == "severe_only":
        group_query += " HAVING SUM(severe_count) > 0"
    elif risk_filter == "severe_warning":
        group_query += " HAVING (SUM(severe_count) > 0 OR SUM(warning_count) > 0)"

    group_query += " ORDER BY created_at DESC"

    all_groups = conn.execute(group_query, params).fetchall()

    total_batches = len(all_groups)

    offset = (page - 1) * page_size
    paged_groups = all_groups[offset:offset + page_size]

    result = []
    for g in paged_groups:
        group = dict(g)
        stations_in_batch = conn.execute(
            "SELECT * FROM reports WHERE region_name = ? AND SUBSTR(created_at, 1, 19) = ? ORDER BY station_name",
            (group["region_name"], group["created_at"]),
        ).fetchall()
        group["stations"] = [dict(s) for s in stations_in_batch]
        result.append(group)

    conn.close()
    return result, total_batches


def get_all_station_names() -> list[str]:
    conn = get_db()
    rows = conn.execute("SELECT DISTINCT station_name FROM reports ORDER BY station_name").fetchall()
    conn.close()
    return [r["station_name"] for r in rows]


def get_all_region_names() -> list[str]:
    conn = get_db()
    rows = conn.execute("SELECT DISTINCT region_name FROM reports WHERE region_name != '' ORDER BY region_name").fetchall()
    conn.close()
    return [r["region_name"] for r in rows]


def get_reports_by_batch(region_name: str, detect_time: str) -> list[dict]:
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM reports WHERE region_name = ? AND SUBSTR(created_at, 1, 19) = SUBSTR(?, 1, 19) ORDER BY station_name",
        (region_name, detect_time),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_batch_detection_results(region_name: str, detect_time: str) -> list[dict]:
    conn = get_db()
    rows = conn.execute("""
        SELECT dr.* FROM detection_results dr
        JOIN reports r ON dr.report_id = r.id
        WHERE r.region_name = ? AND SUBSTR(r.created_at, 1, 19) = SUBSTR(?, 1, 19)
        ORDER BY dr.datetime, dr.station_id
    """, (region_name, detect_time)).fetchall()
    conn.close()
    return [dict(r) for r in rows]
