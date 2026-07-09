from __future__ import annotations

from pydantic import BaseModel, Field


class ToolCallArguments(BaseModel):
    """Arguments for a tool call from the LLM."""

    command: str = Field(description="Shell command to execute")
    working_dir: str = Field(default=".", description="Working directory relative to sandbox")
    timeout: int = Field(default=30, ge=1, le=300, description="Timeout in seconds")


class ToolCall(BaseModel):
    """A single tool call returned by the LLM."""

    name: str = Field(description="Tool function name")
    arguments: ToolCallArguments = Field(description="Tool call arguments")


class LLMMessage(BaseModel):
    """A single message in the LLM conversation."""

    role: str = Field(description="Message role: system|user|assistant|tool")
    content: str = Field(description="Message content")
    tool_call_id: str | None = Field(default=None)


class LLMRequest(BaseModel):
    """Request payload sent to the LLM provider."""

    messages: list[LLMMessage] = Field(description="Conversation messages")
    temperature: float = Field(default=0.1, ge=0.0, le=2.0)
    max_tokens: int = Field(default=1024, ge=1, le=8192)


class LLMResponse(BaseModel):
    """Parsed response from the LLM provider."""

    provider: str = Field(description="LLM provider used")
    model: str = Field(description="Model name")
    content: str | None = Field(default=None, description="Text response")
    tool_calls: list[ToolCall] = Field(default_factory=list)
    usage_tokens: int = Field(default=0, description="Total tokens used")
    latency_ms: float = Field(default=0.0, description="Response latency in ms")
