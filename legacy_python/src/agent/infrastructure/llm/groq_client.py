"""Groq LLM client using the OpenAI-compatible chat completions API.

Sends requests to ``https://api.groq.com/openai/v1/chat/completions``
with function-calling tool definitions for the ``execute_command`` tool.
"""

from __future__ import annotations

import json
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

_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
_PRIMARY_MODEL = "llama-3.3-70b-versatile"
_FALLBACK_MODEL = "mixtral-8x7b-32768"

_TOOL_SCHEMA: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "execute_command",
            "description": (
                "Execute a shell command inside the secure sandbox. "
                "Returns stdout, stderr, and the exit code."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The shell command to execute.",
                    },
                    "working_dir": {
                        "type": "string",
                        "description": "Working directory relative to the sandbox root.",
                        "default": ".",
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "Max seconds to wait for the command.",
                        "default": 30,
                    },
                },
                "required": ["command"],
            },
        },
    }
]


class GroqClient:
    """Async Groq LLM client implementing the ``BaseLLMClient`` protocol."""

    __slots__ = ("_api_key", "_http", "_model")

    def __init__(self, api_key: str, model: str = _PRIMARY_MODEL) -> None:
        self._api_key: str = api_key
        self._model: str = model
        self._http: httpx.AsyncClient = httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, connect=10.0),
        )

    async def complete(self, request: LLMRequest) -> LLMResponse:
        """Send a chat completion request to Groq and parse the response."""
        payload = self._build_payload(request)
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        start = time.perf_counter()
        try:
            resp = await self._http.post(_GROQ_URL, json=payload, headers=headers)
        except httpx.HTTPError as exc:
            raise LLMError("groq", 0, f"HTTP transport error: {exc}") from exc
        latency = (time.perf_counter() - start) * 1000

        if resp.status_code != 200:
            raise LLMError("groq", resp.status_code, resp.text[:500])

        data: dict[str, Any] = resp.json()
        return self._parse_response(data, latency)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _build_payload(self, request: LLMRequest) -> dict[str, Any]:
        """Convert an ``LLMRequest`` into a Groq API payload."""
        messages: list[dict[str, Any]] = []
        for msg in request.messages:
            entry: dict[str, Any] = {"role": msg.role, "content": msg.content}
            if msg.tool_call_id is not None:
                entry["tool_call_id"] = msg.tool_call_id
            messages.append(entry)

        return {
            "model": self._model,
            "messages": messages,
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
            "tools": _TOOL_SCHEMA,
            "tool_choice": "auto",
        }

    def _parse_response(
        self,
        data: dict[str, Any],
        latency_ms: float,
    ) -> LLMResponse:
        """Parse Groq JSON into an ``LLMResponse``."""
        choice = data["choices"][0]
        message = choice["message"]
        content = message.get("content")
        usage = data.get("usage", {})

        tool_calls: list[ToolCall] = []
        for tc in message.get("tool_calls") or []:
            func = tc["function"]
            args = json.loads(func["arguments"]) if isinstance(func["arguments"], str) else func["arguments"]
            tool_calls.append(
                ToolCall(
                    name=func["name"],
                    arguments=ToolCallArguments(
                        command=args.get("command", ""),
                        working_dir=args.get("working_dir", "."),
                        timeout=int(args.get("timeout", 30)),
                    ),
                )
            )

        return LLMResponse(
            provider="groq",
            model=data.get("model", self._model),
            content=content,
            tool_calls=tool_calls,
            usage_tokens=usage.get("total_tokens", 0),
            latency_ms=round(latency_ms, 2),
        )

    async def close(self) -> None:
        """Gracefully close the underlying HTTP client."""
        await self._http.aclose()
