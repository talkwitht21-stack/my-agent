"""Autonomous OS Agent 2.0 — Main entry point.

Starts the Uvicorn server using the configured application factory.
"""

from __future__ import annotations

import logging
import sys

import uvicorn

from agent.api.app import create_app
from agent.config.settings import AppSettings

logger = logging.getLogger("agent")


def _configure_logging(level: str) -> None:
    """Configure root and agent loggers with a uniform format."""
    numeric = getattr(logging, level.upper(), logging.INFO)
    fmt = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"
    logging.basicConfig(
        level=numeric,
        format=fmt,
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
    )
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


def main() -> None:
    """Create the application and run the Uvicorn server."""
    settings = AppSettings()
    _configure_logging(settings.log_level)

    app = create_app(settings)

    logger.info(
        "Starting Agent 2.0 on %s:%d",
        settings.api_host,
        settings.api_port,
    )
    uvicorn.run(
        app,
        host=settings.api_host,
        port=settings.api_port,
        log_level=settings.log_level.lower(),
        timeout_keep_alive=30,
    )


if __name__ == "__main__":
    main()
