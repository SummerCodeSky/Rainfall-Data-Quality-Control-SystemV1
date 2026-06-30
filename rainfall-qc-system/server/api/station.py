import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File

from services.station_loader import load_all_regions, deduplicate_stations

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "../../data"))

router = APIRouter(prefix="/api/stations", tags=["stations"])


@router.get("")
async def list_stations():
    regions = load_all_regions(DATA_DIR)
    if not regions:
        return []
    stations = deduplicate_stations(regions)
    return stations


@router.post("")
async def create_station(body: dict):
    name = body.get("name", "")
    if not name:
        raise HTTPException(400, "name is required")

    import yaml

    first_region_dir = None
    root = Path(DATA_DIR)
    for d in sorted(root.iterdir()):
        if d.is_dir():
            first_region_dir = d
            break

    if first_region_dir is None:
        first_region_dir = root / "RegionalStation默认"
        first_region_dir.mkdir(parents=True, exist_ok=True)

    yaml_file = first_region_dir / "stations.yaml"
    stations_list = []
    if yaml_file.exists():
        with open(yaml_file, "r", encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}
            if isinstance(raw, list):
                stations_list = raw
            elif isinstance(raw, dict):
                stations_list = [raw]

    stations_list.append({
        "name": name,
        "longitude": body.get("longitude", 0),
        "latitude": body.get("latitude", 0),
        "elevation": body.get("elevation", 0),
        "obs_type": body.get("obs_type", "auto"),
    })

    with open(yaml_file, "w", encoding="utf-8") as f:
        yaml.dump(stations_list, f, allow_unicode=True)

    return {"name": name}


@router.put("/{name}")
async def update_station(name: str, body: dict):
    import yaml

    root = Path(DATA_DIR)
    updated = False
    for d in sorted(root.iterdir()):
        if not d.is_dir():
            continue
        yaml_file = d / "stations.yaml"
        if not yaml_file.exists():
            continue
        with open(yaml_file, "r", encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}
        if not isinstance(raw, list):
            continue
        for s in raw:
            if isinstance(s, dict) and s.get("name") == name:
                for key in ["name", "longitude", "latitude", "elevation", "obs_type"]:
                    if key in body:
                        s[key] = body[key]
                updated = True
        if updated:
            with open(yaml_file, "w", encoding="utf-8") as f:
                yaml.dump(raw, f, allow_unicode=True)
            break

    if not updated:
        raise HTTPException(404, "Station not found")

    return {"name": name, "updated": True}


@router.post("/{name}/upload/{table_type}")
async def upload_table(name: str, table_type: str, file: UploadFile = File(...)):
    valid_types = ["excerpt", "daily", "monthly", "period_max"]
    if table_type not in valid_types:
        raise HTTPException(400, f"Invalid table_type. Must be one of: {valid_types}")

    root = Path(DATA_DIR)
    target_dir = None
    for d in sorted(root.iterdir()):
        if d.is_dir():
            target_dir = d
            break

    if target_dir is None:
        target_dir = root / "RegionalStation默认"
        target_dir.mkdir(parents=True, exist_ok=True)

    table_names = {
        "excerpt": "降雨摘录表",
        "daily": "逐日降水表",
        "monthly": "月年降水对照表",
        "period_max": "各时段最大降水量表",
    }

    suffix = Path(file.filename or "data.xlsx").suffix
    if suffix not in [".xlsx", ".xls", ".csv"]:
        suffix = ".xlsx"

    save_path = target_dir / f"{table_names[table_type]}{suffix}"
    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    return {"filename": str(save_path), "size": len(content)}
