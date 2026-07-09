from __future__ import annotations

import logging
from uuid import UUID

from agent.domain.schemas import AuditQuery, AuditRecord
from agent.infrastructure.persistence.sqlite_repo import SQLiteRepository

logger = logging.getLogger(__name__)


class AuditService:
    """Service layer for audit log operations.

    Provides a high-level interface for recording audit events
    and querying audit history.
    """

    def __init__(self, repo: SQLiteRepository) -> None:
        self._repo = repo

    async def log_action(
        self,
        task_id: UUID,
        action: str,
        **kwargs: str | int | None,
    ) -> AuditRecord:
        """Record an audit event for a task.

        Args:
            task_id: The task this action belongs to.
            action: Action identifier (e.g. 'task_received', 'llm_response').
            **kwargs: Optional fields — command, risk_score, decision,
                      llm_provider, llm_raw_json, execution_result.

        Returns:
            The persisted AuditRecord with computed content hash.
        """
        risk_score_raw = kwargs.get("risk_score")
        risk_score = int(risk_score_raw) if risk_score_raw is not None else None

        record = AuditRecord(
            task_id=task_id,
            action=action,
            command=kwargs.get("command"),  # type: ignore[arg-type]
            risk_score=risk_score,
            decision=kwargs.get("decision"),  # type: ignore[arg-type]
            llm_provider=kwargs.get("llm_provider"),  # type: ignore[arg-type]
            llm_raw_json=kwargs.get("llm_raw_json"),  # type: ignore[arg-type]
            execution_result=kwargs.get("execution_result"),  # type: ignore[arg-type]
        )

        await self._repo.insert_audit(record)
        logger.info(
            "Audit logged: task=%s action=%s",
            task_id,
            action,
        )
        return record

    async def get_history(self, query: AuditQuery) -> list[AuditRecord]:
        """Query audit records with filters and pagination."""
        return await self._repo.query_audits(query)

    async def get_task_history(self, task_id: UUID) -> list[AuditRecord]:
        """Retrieve the complete audit trail for a specific task."""
        return await self._repo.get_task_audits(task_id)
