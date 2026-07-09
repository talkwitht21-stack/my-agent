from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

from agent.domain.enums import TaskStatus


def _utc_now() -> datetime:
    """Generate timezone-aware UTC timestamp."""
    return datetime.now(timezone.utc)


class TaskInput(BaseModel):
    """User task input from the Web UI."""

    user_message: str = Field(
        min_length=1, max_length=4096, description="User's natural language task"
    )
    session_id: str | None = Field(default=None, description="Optional session grouping")


class ExecutionResult(BaseModel):
    """Result of a command execution on the Client Node."""

    exit_code: int = Field(description="Command exit code")
    stdout: str = Field(default="", description="Standard output")
    stderr: str = Field(default="", description="Standard error")
    duration_ms: float = Field(default=0.0, ge=0.0)
    truncated: bool = Field(default=False, description="Whether output was truncated")


class TaskResult(BaseModel):
    """Complete lifecycle record for a single task."""

    task_id: UUID = Field(default_factory=uuid4)
    status: TaskStatus = Field(default=TaskStatus.PENDING)
    user_message: str = Field(default="")
    llm_response_raw: str | None = Field(default=None)
    command: str | None = Field(default=None)
    risk_score: int | None = Field(default=None)
    execution: ExecutionResult | None = Field(default=None)
    assistant_reply: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=_utc_now)
    completed_at: datetime | None = Field(default=None)
