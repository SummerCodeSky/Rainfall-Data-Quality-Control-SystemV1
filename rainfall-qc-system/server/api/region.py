import os
import shutil
import yaml
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from services.station_loader import load_region, load_all_regions
from services.file_scanner import (
    scan_region_files,
    group_files_by_category,
    FileCategory,
    MAX_EXCERPT_FILES,
)
from services.pipeline import run_pipeline, generate_report
from services.database import save_report
from api.config import _load_config

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "../../data"))

router = APIRouter(prefix="/api/regions", tags=["regions"])


def _region_dir(name: str) -> Path:
    root = Path(DATA_DIR)
    for d in root.iterdir():
        if d.is_dir() and d.name == name:
            return d
    return root / name


def _read_stations_yaml(region_path: Path) -> list[dict]:
    for yf in [region_path / "stations.yaml", region_path / "station.yaml"]:
        if yf.exists():
            with open(yf, "r", encoding="utf-8") as f:
                raw = yaml.safe_load(f) or {}
            if isinstance(raw, list):
                return raw
            if isinstance(raw, dict):
                return [raw]
    return []


def _write_stations_yaml(region_path: Path, stations: list[dict]):
    yaml_file = region_path / "stations.yaml"
    if not yaml_file.exists() and (region_path / "station.yaml").exists():
        (region_path / "station.yaml").unlink()
    with open(yaml_file, "w", encoding="utf-8") as f:
        yaml.dump(stations, f, allow_unicode=True)


CATEGORY_LABELS = {
    "period_max": "各时段最大降水量表",
    "monthly": "各站月年降水量对照表",
    "daily": "逐日降水量对照表",
    "excerpt": "降水量摘录表",
}

VALID_CATEGORIES = list(CATEGORY_LABELS.keys())


@router.get("")
async def list_regions():
    root = Path(DATA_DIR)
    if not root.is_dir():
        return []

    items = []
    for d in sorted(root.iterdir()):
        if not d.is_dir():
            continue
        rd = load_region(str(d))
        if rd is None:
            continue
        files = rd.files or []
        cat_counts = {}
        for rf in files:
            cat_counts[rf.category.value] = cat_counts.get(rf.category.value, 0) + 1

        items.append({
            "name": rd.name,
            "station_count": len(rd.stations),
            "stations": rd.stations,
            "file_count": len(files),
            "file_counts": cat_counts,
        })

    return items


@router.post("")
async def create_region(body: dict):
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(400, "name is required")
    if not name.startswith("RegionalStation"):
        name = f"RegionalStation{name}"

    region_path = _region_dir(name)
    if region_path.exists():
        raise HTTPException(400, f"Region {name} already exists")

    region_path.mkdir(parents=True, exist_ok=True)
    _write_stations_yaml(region_path, [])

    return {"name": name}


@router.get("/{name}")
async def get_region(name: str):
    region_path = _region_dir(name)
    if not region_path.is_dir():
        raise HTTPException(404, f"Region {name} not found")

    stations = _read_stations_yaml(region_path)
    files = scan_region_files(str(region_path))
    grouped = group_files_by_category(files)

    categories = []
    for cat in ["period_max", "monthly", "daily", "excerpt"]:
        cat_files = grouped.get(cat, [])
        categories.append({
            "key": cat,
            "label": CATEGORY_LABELS[cat],
            "files": [
                {
                    "name": f.file_name,
                    "path": f.file_path,
                    "size": f.file_size,
                    "month": f.month,
                    "station_name": f.station_name,
                }
                for f in cat_files
            ],
        })

    return {
        "name": region_path.name,
        "stations": stations,
        "categories": categories,
    }


@router.post("/{name}/stations")
async def add_station(name: str, body: dict):
    station_name = body.get("name", "")
    if not station_name:
        raise HTTPException(400, "name is required")

    region_path = _region_dir(name)
    region_path.mkdir(parents=True, exist_ok=True)
    stations = _read_stations_yaml(region_path)

    for s in stations:
        if s.get("name") == station_name:
            raise HTTPException(400, f"Station {station_name} already exists")

    stations.append({
        "name": station_name,
        "longitude": body.get("longitude"),
        "latitude": body.get("latitude"),
        "elevation": body.get("elevation"),
        "obs_type": body.get("obs_type", "auto"),
    })
    _write_stations_yaml(region_path, stations)
    return {"name": station_name, "region": name}


@router.put("/{name}/stations/{station_name}")
async def update_station(name: str, station_name: str, body: dict):
    region_path = _region_dir(name)
    if not region_path.is_dir():
        raise HTTPException(404, f"Region {name} not found")

    stations = _read_stations_yaml(region_path)
    found = False
    for s in stations:
        if s.get("name") == station_name:
            for key in ["name", "longitude", "latitude", "elevation", "obs_type"]:
                if key in body:
                    s[key] = body[key]
            found = True
            break

    if not found:
        raise HTTPException(404, f"Station {station_name} not found")

    _write_stations_yaml(region_path, stations)
    return {"name": station_name, "updated": True}


@router.delete("/{name}/stations/{station_name}")
async def delete_station(name: str, station_name: str):
    region_path = _region_dir(name)
    if not region_path.is_dir():
        raise HTTPException(404, f"Region {name} not found")

    stations = _read_stations_yaml(region_path)
    new_stations = [s for s in stations if s.get("name") != station_name]
    if len(new_stations) == len(stations):
        raise HTTPException(404, f"Station {station_name} not found")

    _write_stations_yaml(region_path, new_stations)
    return {"deleted": station_name}


@router.post("/{name}/upload")
async def upload_file(
    name: str,
    category: str = Form(...),
    file: UploadFile = File(...),
):
    if category not in VALID_CATEGORIES:
        raise HTTPException(400, f"Invalid category. Must be one of: {VALID_CATEGORIES}")

    region_path = _region_dir(name)
    region_path.mkdir(parents=True, exist_ok=True)

    if category == "excerpt":
        existing = scan_region_files(str(region_path))
        excerpt_count = sum(1 for rf in existing if rf.category == FileCategory.EXCERPT)
        if excerpt_count >= MAX_EXCERPT_FILES:
            raise HTTPException(400, f"降水量摘录表已超过上限 {MAX_EXCERPT_FILES} 个")

    orig_name = file.filename or "uploaded_file"
    suffix = Path(orig_name).suffix
    if suffix.lower() not in {".xlsx", ".xls", ".csv", ".xlsm"}:
        suffix = ".xlsx"

    save_path = region_path / f"{Path(orig_name).stem}{suffix}"

    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    return {"filename": save_path.name, "size": len(content), "region": name, "category": category}


@router.delete("/{name}/files/{filename}")
async def delete_file(name: str, filename: str):
    region_path = _region_dir(name)
    if not region_path.is_dir():
        raise HTTPException(404, f"Region {name} not found")

    target = region_path / filename
    if not target.exists():
        raise HTTPException(404, f"File {filename} not found")

    target.unlink()
    return {"deleted": filename, "region": name}


@router.delete("/{name}")
async def delete_region(name: str):
    region_path = _region_dir(name)
    if not region_path.is_dir():
        raise HTTPException(404, f"Region {name} not found")

    shutil.rmtree(region_path)
    return {"deleted": name}


@router.post("/{name}/detect")
async def detect_region(name: str):
    region_path = _region_dir(name)
    if not region_path.is_dir():
        raise HTTPException(404, f"Region {name} not found")

    config = _load_config()
    rd = load_region(str(region_path))
    if rd is None or not rd.stations:
        raise HTTPException(404, f"Region {name} has no data")

    all_regions = load_all_regions(DATA_DIR)
    if not all_regions:
        all_regions = [rd]

    all_results = []
    by_station: dict[str, dict] = {}

    for station in rd.stations:
        station_name = station.get("name", "")
        if not station_name:
            continue
        try:
            report_obj, results = run_pipeline(station_name, all_regions, config)
            counts = {"total": 0, "Severe": 0, "Warning": 0, "General": 0, "Info": 0}
            station_results = []
            for r in results:
                counts["total"] += 1
                counts[r.flag_level.value] += 1
                station_results.append({
                    "station_id": r.station_id,
                    "detector": r.detector,
                    "data_type": r.data_type,
                    "datetime": r.datetime,
                    "value": r.value,
                    "expected_value": r.expected_value,
                    "deviation": r.deviation,
                    "trigger_rule": r.trigger_rule,
                    "flag_level": r.flag_level.value,
                    "detail": r.detail,
                })
                all_results.append(station_results[-1])

            save_report(
                {
                    "id": report_obj.id,
                    "station_name": station_name,
                    "region_name": name,
                    "created_at": report_obj.created_at.isoformat(),
                    "total_flags": counts["total"],
                    "severe_count": counts["Severe"],
                    "warning_count": counts["Warning"],
                    "general_count": counts["General"],
                    "info_count": counts["Info"],
                    "status": "completed",
                },
                station_results,
            )

            by_station[station_name] = counts
        except Exception as e:
            print(f"  [WARN] Detection failed for {station_name}: {e}")
            by_station[station_name] = {"total": 0, "Severe": 0, "Warning": 0, "General": 0, "Info": 0, "error": str(e)}

    total_severe = sum(v.get("Severe", 0) for v in by_station.values())
    total_warning = sum(v.get("Warning", 0) for v in by_station.values())
    total_general = sum(v.get("General", 0) for v in by_station.values())
    total_info = sum(v.get("Info", 0) for v in by_station.values())

    return {
        "region": name,
        "total_flags": len(all_results),
        "severe_count": total_severe,
        "warning_count": total_warning,
        "general_count": total_general,
        "info_count": total_info,
        "by_station": by_station,
        "results": all_results,
    }


@router.post("/detect-all")
async def detect_all_regions():
    config = _load_config()
    all_regions = load_all_regions(DATA_DIR)

    if not all_regions:
        raise HTTPException(404, "No regions found")

    from services.station_loader import deduplicate_stations
    stations = deduplicate_stations(all_regions)

    all_results = []
    by_station: dict[str, dict] = {}
    by_region: dict[str, dict] = {}

    for station in stations:
        station_name = station.get("name", "")
        region_name = station.get("region", "")
        if not station_name:
            continue
        try:
            report_obj, results = run_pipeline(station_name, all_regions, config)
            counts = {"total": 0, "Severe": 0, "Warning": 0, "General": 0, "Info": 0}
            station_results = []
            for r in results:
                counts["total"] += 1
                counts[r.flag_level.value] += 1
                station_results.append({
                    "station_id": r.station_id,
                    "detector": r.detector,
                    "data_type": r.data_type,
                    "datetime": r.datetime,
                    "value": r.value,
                    "expected_value": r.expected_value,
                    "deviation": r.deviation,
                    "trigger_rule": r.trigger_rule,
                    "flag_level": r.flag_level.value,
                    "detail": r.detail,
                })
                all_results.append(station_results[-1])

            save_report(
                {
                    "id": report_obj.id,
                    "station_name": station_name,
                    "region_name": region_name,
                    "created_at": report_obj.created_at.isoformat(),
                    "total_flags": counts["total"],
                    "severe_count": counts["Severe"],
                    "warning_count": counts["Warning"],
                    "general_count": counts["General"],
                    "info_count": counts["Info"],
                    "status": "completed",
                },
                station_results,
            )

            by_station[station_name] = counts

            for region in all_regions:
                if any(s.get("name") == station_name for s in region.stations):
                    rin = region.name
                    by_region.setdefault(rin, {"total": 0, "Severe": 0, "Warning": 0, "General": 0, "Info": 0})
                    for k in ["total", "Severe", "Warning", "General", "Info"]:
                        by_region[rin][k] += counts[k]
                    break
        except Exception as e:
            print(f"  [WARN] Detection failed for {station_name}: {e}")
            by_station[station_name] = {"total": 0, "Severe": 0, "Warning": 0, "General": 0, "Info": 0, "error": str(e)}

    total_severe = sum(v.get("Severe", 0) for v in by_station.values())
    total_warning = sum(v.get("Warning", 0) for v in by_station.values())
    total_general = sum(v.get("General", 0) for v in by_station.values())
    total_info = sum(v.get("Info", 0) for v in by_station.values())

    return {
        "total_flags": len(all_results),
        "severe_count": total_severe,
        "warning_count": total_warning,
        "general_count": total_general,
        "info_count": total_info,
        "by_region": by_region,
        "by_station": by_station,
        "results": all_results,
    }
