from __future__ import annotations

import time

from fastapi import APIRouter

_START_TIME: float = time.monotonic()

health_router = APIRouter(tags=["health"])


@health_router.get("/api/health")
async def health_check() -> dict[str, str | float]:
    """System health and uptime endpoint.

    Returns the current service status, version, and uptime in seconds.
    """
    uptime = time.monotonic() - _START_TIME
    return {
        "status": "ok",
        "version": "2.0.0",
        "uptime_seconds": round(uptime, 2),
    }
