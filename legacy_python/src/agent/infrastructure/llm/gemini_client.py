"""Gemini LLM client using the Google Generative Language API.

Sends requests to
``https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent``
and converts between the agent's internal schema and Gemini's native
request/response format (``contents`` array, ``functionCall`` objects).
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from agent.domain.schemas.llm import (
    LLMRequest,
    LLMResponse,
    ToolCall,
    ToolCallArguments,
)
from agent.infrastructure.llm.base import LLMError

logger = logging.getLogger(__name__)

_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
_DEFAULT_MODEL = "gemini-2.0-flash"

_TOOL_DECLARATIONS: list[dict[str, Any]] = [
    {
        "functionDeclarations": [
            {
                "name": "execute_command",
                "description": (
                    "Execute a shell command inside the secure sandbox. "
                    "Returns stdout, stderr, and the exit code."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "command": {
                            "type": "STRING",
                            "description": "The shell command to execute.",
                        },
                        "working_dir": {
                            "type": "STRING",
                            "description": (
                                "Working directory relative to sandbox root."
                            ),
                        },
                        "timeout": {
                            "type": "INTEGER",
                            "description": "Max seconds to wait.",
                        },
                    },
                    "required": ["command"],
                },
            }
        ]
    }
]

# Gemini uses "user" and "model" as roles.
_ROLE_MAP: dict[str, str] = {
    "system": "user",
    "user": "user",
    "assistant": "model",
    "tool": "user",
}


class GeminiClient:
    """Async Gemini LLM client implementing the ``BaseLLMClient`` protocol."""

    __slots__ = ("_api_key", "_model", "_http")

    def __init__(
        self,
        api_key: str,
        model: str = _DEFAULT_MODEL,
    ) -> None:
        self._api_key: str = api_key
        self._model: str = model
        self._http: httpx.AsyncClient = httpx.AsyncClient(
            timeout=httpx.Timeout(90.0, connect=10.0),
        )

    async def complete(self, request: LLMRequest) -> LLMResponse:
        """Send a generateContent request to Gemini and parse the response."""
        url = f"{_GEMINI_BASE}/{self._model}:generateContent?key={self._api_key}"
        payload = self._build_payload(request)

        start = time.perf_counter()
        try:
            resp = await self._http.post(url, json=payload)
        except httpx.HTTPError as exc:
            raise LLMError("gemini", 0, f"HTTP transport error: {exc}") from exc
        latency = (time.perf_counter() - start) * 1000

        if resp.status_code != 200:
            raise LLMError("gemini", resp.status_code, resp.text[:500])

        data: dict[str, Any] = resp.json()
        return self._parse_response(data, latency)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _build_payload(self, request: LLMRequest) -> dict[str, Any]:
        """Convert an ``LLMRequest`` into the Gemini API payload."""
        contents: list[dict[str, Any]] = []
        for msg in request.messages:
            role = _ROLE_MAP.get(msg.role, "user")
            contents.append({
                "role": role,
                "parts": [{"text": msg.content}],
            })

        return {
            "contents": contents,
            "tools": _TOOL_DECLARATIONS,
            "generationConfig": {
                "temperature": request.temperature,
                "maxOutputTokens": request.max_tokens,
            },
        }

    def _parse_response(
        self,
        data: dict[str, Any],
        latency_ms: float,
    ) -> LLMResponse:
        """Parse Gemini JSON into an ``LLMResponse``."""
        candidates = data.get("candidates", [])
        if not candidates:
            raise LLMError("gemini", 0, "No candidates in Gemini response")

        parts = candidates[0].get("content", {}).get("parts", [])

        content: str | None = None
        tool_calls: list[ToolCall] = []

        for part in parts:
            if "text" in part:
                content = part["text"]
            elif "functionCall" in part:
                fc = part["functionCall"]
                args = fc.get("args", {})
                tool_calls.append(
                    ToolCall(
                        name=fc["name"],
                        arguments=ToolCallArguments(
                            command=args.get("command", ""),
                            working_dir=args.get("working_dir", "."),
                            timeout=int(args.get("timeout", 30)),
                        ),
                    )
                )

        usage_meta = data.get("usageMetadata", {})
        total_tokens = usage_meta.get(
            "totalTokenCount",
            usage_meta.get("promptTokenCount", 0)
            + usage_meta.get("candidatesTokenCount", 0),
        )

        return LLMResponse(
            provider="gemini",
            model=self._model,
            content=content,
            tool_calls=tool_calls,
            usage_tokens=total_tokens,
            latency_ms=round(latency_ms, 2),
        )

    async def close(self) -> None:
        """Gracefully close the underlying HTTP client."""
        await self._http.aclose()
