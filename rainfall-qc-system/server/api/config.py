import os
import yaml
from pathlib import Path
from fastapi import APIRouter, HTTPException

CONFIG_PATH = os.environ.get("CONFIG_PATH", os.path.join(os.path.dirname(__file__), "../../config.yaml"))

DEFAULT_CONFIG = {
    "detection": {
        "persistent_trace": {
            "enabled": True,
            "window_hours": 6,
            "low_min": 0.1,
            "low_max": 0.5,
            "duration_tiers": {
                "info": [3, 6],
                "general": [6, 12],
                "warning": [12, 24],
                "severe": 24,
            },
        },
        "stagnation": {
            "enabled": True,
            "stagnation_values": [0.1, 0.2],
            "count_tiers": {
                "info": [3, 5],
                "general": [5, 8],
                "warning": [8, 12],
                "severe": 12,
            },
        },
        "climate_extreme": {
            "enabled": True,
            "hourly_max": 150.0,
            "percentile": 99.9,
            "station_limits": {},
        },
        "jump_step": {
            "enabled": True,
            "min_ratio": 2.0,
            "min_abs_diff": 10.0,
            "ratio_tiers": {
                "info": [2.0, 5.0],
                "general": [5.0, 10.0],
                "warning": [10.0, 30.0],
                "severe": 30.0,
            },
            "abs_diff_tiers": {
                "info": [10.0, 20.0],
                "general": [20.0, 50.0],
                "warning": [50.0, 100.0],
                "severe": 100.0,
            },
        },
        "cross_station": {
            "enabled": True,
            "std_tiers": {
                "info": [2.0, 3.0],
                "general": [3.0, 4.0],
                "warning": [4.0, 5.0],
                "severe": 5.0,
            },
            "gap_tiers": {
                "info": [2.0, 5.0],
                "general": [5.0, 10.0],
                "warning": [10.0, 20.0],
                "severe": 20.0,
            },
        },
        "daily_cross_station": {
            "enabled": True,
            "gap_tiers": {
                "info": [2.0, 5.0],
                "general": [5.0, 10.0],
                "warning": [10.0, 20.0],
                "severe": 20.0,
            },
            "outlier_small_factor": 0.05,
            "outlier_large_factor": 3.0,
            "micro_threshold": 0.2,
            "neighbor_dry_threshold": 0.2,
        },
        "human_error": {
            "enabled": True,
            "flood_months": [5, 6, 7, 8, 9, 10],
            "non_flood_months": [1, 2, 3, 4, 11, 12],
        },
        "monthly_comparison": {
            "enabled": True,
            "flood_months": [5, 6, 7, 8, 9, 10],
            "non_flood_months": [1, 2, 3, 4, 11, 12],
            "non_flood_diff_max": 10.0,
            "non_flood_ratio_max": 2.0,
            "flood_diff_min": 5.0,
            "flood_diff_max": 200.0,
            "flood_ratio_max": 5.0,
            "gap_tiers": {
                "info": [1.5, 2.0],
                "general": [2.0, 3.0],
                "warning": [3.0, 5.0],
                "severe": 5.0,
            },
        },
        "yearly_comparison": {
            "enabled": True,
            "precip_ratio_max": 2.0,
            "days_ratio_max": 2.0,
            "precip_diff_min": 100.0,
            "days_diff_min": 10,
        },
        "period_max": {
            "enabled": True,
            "stagnation_count": 3,
            "gap_tiers": {
                "info": [2.0, 5.0],
                "general": [5.0, 10.0],
                "warning": [10.0, 20.0],
                "severe": 20.0,
            },
        },
    }
}

router = APIRouter(prefix="/api/config", tags=["config"])


def _load_config() -> dict:
    path = Path(CONFIG_PATH)
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            user_config = yaml.safe_load(f) or {}
        merged = DEFAULT_CONFIG.copy()
        if "detection" in user_config:
            for key, val in user_config["detection"].items():
                if key in merged.get("detection", {}) and isinstance(val, dict):
                    merged["detection"][key].update(val)
                elif key in merged.get("detection", {}):
                    merged["detection"][key] = val
        return merged
    return DEFAULT_CONFIG


@router.get("")
async def get_config():
    return _load_config()


@router.put("")
async def update_config(body: dict):
    path = Path(CONFIG_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(body, f, allow_unicode=True, default_flow_style=False)
    return {"updated": True}
