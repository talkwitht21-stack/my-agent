from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from agent.api.routes.health import health_router
from agent.api.routes.tasks import tasks_router
from agent.api.websocket.hitl_manager import HITLManager
from agent.config.settings import AppSettings
from agent.infrastructure.context.compressor import ContextCompressor
from agent.infrastructure.execution.sandbox import SandboxRuntime
from agent.infrastructure.execution.ssh_client import SSHExecutor
from agent.infrastructure.llm.switcher import LLMSwitcher
from agent.infrastructure.persistence.sqlite_repo import SQLiteRepository
from agent.security.path_validator import PathValidator
from agent.security.risk_engine import RiskEngine
from agent.services.audit_service import AuditService
from agent.services.orchestrator import TaskOrchestrator

logger = logging.getLogger(__name__)


def create_app(settings: AppSettings) -> FastAPI:
    """Application factory with full dependency wiring.

    Creates and configures the FastAPI application with all infrastructure
    components, services, middleware, and route registration.
    """
    ssh = SSHExecutor(
        host=settings.ssh_host,
        port=settings.ssh_port,
        username=settings.ssh_user,
        key_path=settings.resolved_ssh_key_path,
    )
    path_validator = PathValidator(sandbox_root=settings.resolved_sandbox_root)
    sandbox = SandboxRuntime(
        ssh=ssh,
        sandbox_root=settings.resolved_sandbox_root,
        path_validator=path_validator,
    )
    db_repo = SQLiteRepository(db_path=settings.resolved_database_path)
    compressor = ContextCompressor(
        window_size=settings.context_window_size,
        max_tokens=settings.max_context_tokens,
    )
    llm_switcher = LLMSwitcher(settings=settings)
    risk_engine = RiskEngine()
    audit_service = AuditService(repo=db_repo)
    hitl_manager = HITLManager()
    orchestrator = TaskOrchestrator(
        llm=llm_switcher,
        risk_engine=risk_engine,
        sandbox=sandbox,
        audit=audit_service,
        compressor=compressor,
        hitl_callback=hitl_manager.request_approval,
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        logger.info("Starting Autonomous OS Agent 2.0")
        await db_repo.initialize()
        try:
            await ssh.connect()
        except Exception as exc:
            logger.warning("SSH connection deferred: %s", exc)
        yield
        logger.info("Shutting down Autonomous OS Agent 2.0")
        await ssh.disconnect()
        await db_repo.close()

    app = FastAPI(
        title="Autonomous OS Agent",
        version="2.0.0",
        lifespan=lifespan,
    )

    app.state.settings = settings
    app.state.orchestrator = orchestrator
    app.state.audit_service = audit_service
    app.state.hitl_manager = hitl_manager

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(tasks_router)

    frontend_dir = Path(__file__).resolve().parent.parent.parent.parent / "frontend"
    if frontend_dir.is_dir():
        app.mount(
            "/static",
            StaticFiles(directory=str(frontend_dir), html=True),
            name="static",
        )

    return app
