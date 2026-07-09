"""Base abstractions for LLM provider clients.

Defines the ``BaseLLMClient`` protocol that every concrete provider must
satisfy, and the ``LLMError`` exception used to surface provider failures
throughout the system.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from agent.domain.schemas.llm import LLMRequest, LLMResponse


class LLMError(Exception):
    """Exception raised when an LLM provider returns an error.

    Attributes:
        provider: Name of the provider that failed.
        status_code: HTTP status code returned by the provider (0 if
                     the error was not HTTP-related).
        message: Human-readable error description.
    """

    __slots__ = ("provider", "status_code", "message")

    def __init__(
        self,
        provider: str,
        status_code: int,
        message: str,
    ) -> None:
        self.provider: str = provider
        self.status_code: int = status_code
        self.message: str = message
        super().__init__(f"[{provider}] HTTP {status_code}: {message}")


@runtime_checkable
class BaseLLMClient(Protocol):
    """Protocol that all LLM provider clients must implement.

    The single ``complete`` method accepts an ``LLMRequest`` and returns
    an ``LLMResponse``.  Implementations are expected to be async-first
    and to raise ``LLMError`` on failures.
    """

    async def complete(self, request: LLMRequest) -> LLMResponse: ...
