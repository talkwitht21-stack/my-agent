from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


def _utc_now() -> datetime:
    """Generate timezone-aware UTC timestamp."""
    return datetime.now(timezone.utc)


class AuditRecord(BaseModel):
    """Immutable audit log entry with integrity hash."""

    id: UUID = Field(default_factory=uuid4)
    task_id: UUID = Field(description="Related task ID")
    timestamp: datetime = Field(default_factory=_utc_now)
    action: str = Field(description="Action performed")
    command: str | None = Field(default=None)
    risk_score: int | None = Field(default=None)
    decision: str | None = Field(default=None)
    llm_provider: str | None = Field(default=None)
    llm_raw_json: str | None = Field(default=None)
    execution_result: str | None = Field(default=None)
    content_hash: str = Field(default="", description="SHA-256 integrity hash")

    def compute_hash(self) -> str:
        """Compute SHA-256 hash for tamper detection."""
        payload = (
            f"{self.task_id}|{self.action}|{self.command}"
            f"|{self.decision}|{self.timestamp.isoformat()}"
        )
        return hashlib.sha256(payload.encode()).hexdigest()

    def model_post_init(self, __context: object) -> None:
        """Auto-compute content hash after model initialization."""
        if not self.content_hash:
            self.content_hash = self.compute_hash()


class AuditQuery(BaseModel):
    """Query parameters for audit log retrieval."""

    task_id: UUID | None = Field(default=None)
    action: str | None = Field(default=None)
    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)
