"""Autonomous OS Agent 2.0 — Main entry point.

Wires all components via dependency injection, registers lifespan
hooks, and starts the Uvicorn server.
"""

from __future__ import annotations

import asyncio
import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

import uvicorn
from fastapi import FastAPI

from src.agent.api.app import create_app
from src.agent.api.websocket.hitl_manager import HITLManager
from src.agent.config.settings import AppSettings
from src.agent.infrastructure.context.compressor import ContextCompressor
from src.agent.infrastructure.execution.sandbox import SandboxRuntime
from src.agent.infrastructure.execution.ssh_client import SSHExecutor
from src.agent.infrastructure.llm.switcher import LLMSwitcher
from src.agent.infrastructure.persistence.sqlite_repo import SQLiteRepository
from src.agent.security.path_validator import PathValidator
from src.agent.security.policies import SecurityPolicies
from src.agent.security.risk_engine import RiskEngine
from src.agent.services.audit_service import AuditService
from src.agent.services.orchestrator import TaskOrchestrator

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


def _build_components(settings: AppSettings) -> dict:
    """Instantiate and wire all components (DI container)."""
    policies = SecurityPolicies()
    risk_engine = RiskEngine(policies=policies)
    path_validator = PathValidator(sandbox_root=settings.sandbox_root)

    ssh_executor = SSHExecutor(
        host=settings.ssh_host,
        port=settings.ssh_port,
        username=settings.ssh_username,
        key_path=settings.ssh_key_path,
    )
    sandbox = SandboxRuntime(
        executor=ssh_executor,
        path_validator=path_validator,
    )
    llm = LLMSwitcher.create(settings)
    compressor = ContextCompressor(max_tokens=settings.max_context_tokens)

    db = SQLiteRepository(db_path=settings.db_path)
    audit = AuditService(repository=db)
    hitl_manager = HITLManager()

    orchestrator = TaskOrchestrator(
        llm=llm,
        risk_engine=risk_engine,
        sandbox=sandbox,
        compressor=compressor,
        audit=audit,
        approval_callback=hitl_manager.request_approval,
    )

    return {
        "settings": settings,
        "policies": policies,
        "risk_engine": risk_engine,
        "path_validator": path_validator,
        "ssh_executor": ssh_executor,
        "sandbox": sandbox,
        "llm": llm,
        "compressor": compressor,
        "db": db,
        "audit": audit,
        "hitl_manager": hitl_manager,
        "orchestrator": orchestrator,
    }


async def _startup(components: dict) -> None:
    """Run all async initialisation tasks."""
    db: SQLiteRepository = components["db"]
    await db.initialize()
    logger.info("SQLite database initialised at %s", db.db_path)

    ssh: SSHExecutor = components["ssh_executor"]
    await ssh.connect()
    logger.info("SSH connection established to %s", ssh.host)

    logger.info("Agent 2.0 startup complete.")


async def _shutdown(components: dict) -> None:
    """Gracefully tear down resources."""
    ssh: SSHExecutor = components["ssh_executor"]
    await ssh.disconnect()
    logger.info("SSH connection closed.")

    db: SQLiteRepository = components["db"]
    await db.close()
    logger.info("Database connection closed.")


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    """FastAPI lifespan context manager for startup/shutdown."""
    components = app.state.components
    await _startup(components)
    try:
        yield
    finally:
        await _shutdown(components)


def main() -> None:
    """Create the application, attach components, and run."""
    settings = AppSettings()
    _configure_logging(settings.log_level)

    components = _build_components(settings)
    app = create_app(lifespan=_lifespan)

    # Attach all components to app.state for route/handler access
    app.state.components = components
    for name, component in components.items():
        setattr(app.state, name, component)

    # Mount static frontend
    frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"
    if frontend_dir.is_dir():
        from starlette.staticfiles import StaticFiles
        app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
        logger.info("Frontend served from %s", frontend_dir)

    logger.info(
        "Starting Agent 2.0 on %s:%d (env=%s)",
        settings.host,
        settings.port,
        settings.environment,
    )
    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level.lower(),
        timeout_keep_alive=30,
    )


if __name__ == "__main__":
    main()
