from __future__ import annotations

import logging

from agent.domain.schemas import LLMMessage

logger = logging.getLogger(__name__)


class ContextCompressor:
    """Sliding window context compressor for LLM conversations.

    Preserves system messages, applies a sliding window to conversation
    history, and summarizes dropped messages to maintain context within
    the configured token budget.
    """

    CHARS_PER_TOKEN: int = 4

    def __init__(self, window_size: int = 10, max_tokens: int = 4096) -> None:
        self._window_size = window_size
        self._max_tokens = max_tokens

    def compress(self, messages: list[LLMMessage]) -> list[LLMMessage]:
        """Compress conversation history to fit within token budget.

        Args:
            messages: Full conversation message history.

        Returns:
            Compressed message list with system messages preserved.
        """
        if not messages:
            return []

        system_msgs = [m for m in messages if m.role == "system"]
        other_msgs = [m for m in messages if m.role != "system"]

        if len(other_msgs) > self._window_size:
            windowed = other_msgs[-self._window_size :]
            dropped = other_msgs[: -self._window_size]
        else:
            windowed = other_msgs
            dropped = []

        result: list[LLMMessage] = list(system_msgs)

        if dropped:
            summary = self._summarize_dropped(dropped)
            result.append(LLMMessage(role="system", content=summary))

        result.extend(windowed)

        while (
            self._estimate_tokens(result) > self._max_tokens
            and len(result) > 2
        ):
            result.pop(1)
            logger.warning(
                "Aggressive truncation: removed message to fit token budget"
            )

        logger.debug(
            "Context compressed: %d -> %d messages, ~%d tokens",
            len(messages),
            len(result),
            self._estimate_tokens(result),
        )

        return result

    def _estimate_tokens(self, messages: list[LLMMessage]) -> int:
        """Estimate total token count using character-based heuristic."""
        return sum(len(m.content) // self.CHARS_PER_TOKEN for m in messages)

    def _summarize_dropped(self, dropped: list[LLMMessage]) -> str:
        """Build a concise summary of dropped conversation messages."""
        lines: list[str] = [
            f"[Context Summary] {len(dropped)} earlier messages were compressed."
        ]

        preview_count = min(len(dropped), 5)
        for msg in dropped[:preview_count]:
            truncated_content = msg.content[:80]
            suffix = "..." if len(msg.content) > 80 else ""
            lines.append(f"- {msg.role}: {truncated_content}{suffix}")

        if len(dropped) > 5:
            lines.append(f"... and {len(dropped) - 5} more messages.")

        return "\n".join(lines)
