from __future__ import annotations

from enum import StrEnum


class LLMProvider(StrEnum):
    """Supported LLM API providers."""

    GROQ = "groq"
    GEMINI = "gemini"


class RiskLevel(StrEnum):
    """Risk classification levels."""

    ALLOW = "allow"
    ASK = "ask"
    DENY = "deny"


class TaskStatus(StrEnum):
    """Task lifecycle states."""

    PENDING = "pending"
    AWAITING_APPROVAL = "awaiting_approval"
    APPROVED = "approved"
    DENIED = "denied"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"


class HITLDecision(StrEnum):
    """Human-in-the-loop decision outcomes."""

    ALLOW = "allow"
    DENY = "deny"
    TIMEOUT = "timeout"
