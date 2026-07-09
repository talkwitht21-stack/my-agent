"""LLM provider switcher with automatic failover and retry logic.

``LLMSwitcher`` wraps multiple ``BaseLLMClient`` instances and routes
requests through the primary provider first.  On failure (including
HTTP 429 rate-limits) it retries with exponential backoff and then
automatically falls over to the configured fallback provider.
"""

from __future__ import annotations

import logging
from typing import Any

from tenacity import (
    AsyncRetrying,
    RetryError,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from agent.config.settings import AppSettings
from agent.domain.enums import LLMProvider
from agent.domain.schemas.llm import LLMRequest, LLMResponse
from agent.infrastructure.llm.base import BaseLLMClient, LLMError
from agent.infrastructure.llm.gemini_client import GeminiClient
from agent.infrastructure.llm.groq_client import GroqClient

logger = logging.getLogger(__name__)

_MAX_RETRIES = 3
_WAIT_MIN = 1
_WAIT_MAX = 8


class LLMSwitcher:
    """Route LLM requests with retry and automatic provider failover.

    The switcher tries the **primary** provider up to ``_MAX_RETRIES``
    times with exponential back-off (1 s → 8 s).  If every attempt
    fails, it switches to the **fallback** provider and repeats the
    retry cycle.  The active provider is tracked so that subsequent
    calls continue using whichever provider last succeeded.
    """

    __slots__ = ("_settings", "_clients", "_active")

    def __init__(
        self,
        settings: AppSettings,
        clients: dict[LLMProvider, BaseLLMClient],
    ) -> None:
        self._settings: AppSettings = settings
        self._clients: dict[LLMProvider, BaseLLMClient] = clients
        self._active: LLMProvider = settings.primary_llm

    @property
    def active_provider(self) -> LLMProvider:
        """Return the currently active LLM provider."""
        return self._active

    async def complete(self, request: LLMRequest) -> LLMResponse:
        """Send *request* through the active provider with retry/failover.

        Raises:
            LLMError: If both primary and fallback providers are exhausted.
        """
        providers = self._ordered_providers()

        last_error: LLMError | None = None
        for provider in providers:
            client = self._clients.get(provider)
            if client is None:
                continue

            try:
                response = await self._attempt_with_retries(client, request)
                self._active = provider
                logger.info("LLM response via %s (active)", provider)
                return response
            except (LLMError, RetryError) as exc:
                last_error = exc if isinstance(exc, LLMError) else LLMError(
                    provider=str(provider),
                    status_code=0,
                    message=f"Retries exhausted: {exc}",
                )
                logger.warning(
                    "Provider %s failed, trying next: %s",
                    provider,
                    last_error.message[:120],
                )

        raise last_error or LLMError(
            provider="none",
            status_code=0,
            message="No LLM providers available",
        )

    # ------------------------------------------------------------------
    # Factory
    # ------------------------------------------------------------------

    @classmethod
    def create(cls, settings: AppSettings) -> LLMSwitcher:
        """Construct an ``LLMSwitcher`` from application settings.

        Instantiates concrete provider clients based on available API
        keys and wires them into the switcher.
        """
        clients: dict[LLMProvider, BaseLLMClient] = {}

        if settings.groq_api_key:
            clients[LLMProvider.GROQ] = GroqClient(api_key=settings.groq_api_key)
            logger.info("Groq client registered")

        if settings.gemini_api_key:
            clients[LLMProvider.GEMINI] = GeminiClient(api_key=settings.gemini_api_key)
            logger.info("Gemini client registered")

        if not clients:
            raise LLMError(
                provider="none",
                status_code=0,
                message="No LLM API keys configured",
            )

        return cls(settings=settings, clients=clients)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _ordered_providers(self) -> list[LLMProvider]:
        """Return providers in priority order: active first, then fallback."""
        fallback = (
            self._settings.fallback_llm
            if self._settings.fallback_llm != self._active
            else self._settings.primary_llm
        )
        order = [self._active]
        if fallback != self._active:
            order.append(fallback)
        return order

    @staticmethod
    async def _attempt_with_retries(
        client: BaseLLMClient,
        request: LLMRequest,
    ) -> LLMResponse:
        """Execute a completion request with exponential-backoff retries."""
        async for attempt in AsyncRetrying(
            retry=retry_if_exception_type(LLMError),
            stop=stop_after_attempt(_MAX_RETRIES),
            wait=wait_exponential(min=_WAIT_MIN, max=_WAIT_MAX),
            reraise=True,
        ):
            with attempt:
                return await client.complete(request)
        # Unreachable – tenacity will raise before this point
        raise LLMError("unknown", 0, "Retry loop exited unexpectedly")  # pragma: no cover
