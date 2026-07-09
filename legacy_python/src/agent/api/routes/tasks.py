from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request

from agent.domain.schemas import AuditRecord, TaskInput, TaskResult
from agent.services.audit_service import AuditService
from agent.services.orchestrator import TaskOrchestrator

logger = logging.getLogger(__name__)

tasks_router = APIRouter(prefix="/api", tags=["tasks"])


@tasks_router.post("/tasks", response_model=TaskResult)
async def create_task(task_input: TaskInput, request: Request) -> TaskResult:
    """Submit a new task for the agent to process.

    Accepts a natural language task, runs it through the full orchestration
    pipeline (LLM, risk assessment, optional HITL, execution), and returns
    the complete task result.
    """
    orchestrator: TaskOrchestrator = request.app.state.orchestrator
    try:
        result = await orchestrator.process_task(task_input)
        return result
    except Exception as exc:
        logger.error("Task processing failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@tasks_router.get("/tasks/{task_id}/audits", response_model=list[AuditRecord])
async def get_task_audits(task_id: UUID, request: Request) -> list[AuditRecord]:
    """Retrieve the complete audit trail for a specific task.

    Returns all audit records associated with the given task ID,
    ordered by timestamp descending.
    """
    audit_service: AuditService = request.app.state.audit_service
    try:
        records = await audit_service.get_task_history(task_id)
        return records
    except Exception as exc:
        logger.error("Audit retrieval failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
