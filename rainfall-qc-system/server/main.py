from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.station import router as station_router
from api.config import router as config_router
from api.detection import router as detection_router
from api.region import router as region_router
from services.database import init_db

app = FastAPI(title="区域多站点雨量数据质量控制系统", version="1.0.0")

init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(station_router)
app.include_router(config_router)
app.include_router(detection_router)
app.include_router(region_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
