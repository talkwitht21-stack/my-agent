from __future__ import annotations

import datetime
import logging
from collections.abc import Awaitable, Callable
from uuid import UUID, uuid4

from agent.domain.enums import HITLDecision, RiskLevel, TaskStatus
from agent.domain.schemas import (
    ExecutionResult,
    LLMMessage,
    LLMRequest,
    LLMResponse,
    RiskAssessment,
    TaskInput,
    TaskResult,
)
from agent.infrastructure.context.compressor import ContextCompressor
from agent.infrastructure.execution.sandbox import SandboxRuntime
from agent.infrastructure.llm.switcher import LLMSwitcher
from agent.security.risk_engine import RiskEngine
from agent.services.audit_service import AuditService

logger = logging.getLogger(__name__)

SYSTEM_PROMPT: str = (
    "You are an autonomous OS automation assistant. "
    "You have access to the following tool:\n\n"
    "**execute_command**\n"
    "- command (str): Shell command to execute\n"
    "- working_dir (str): Working directory relative to sandbox (default: '.')\n"
    "- timeout (int): Timeout in seconds (default: 30)\n\n"
    "When the user asks you to perform a system task, use the execute_command tool.\n"
    "Always explain what you are about to do before executing.\n"
    "If no command is needed, respond with helpful text."
)

HITLCallback = Callable[[UUID, str, RiskAssessment], Awaitable[HITLDecision]]


def _utc_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


class TaskOrchestrator:
    """Core orchestration engine for task lifecycle management."""

    def __init__(
        self,
        llm: LLMSwitcher,
        risk_engine: RiskEngine,
        sandbox: SandboxRuntime,
        audit: AuditService,
        compressor: ContextCompressor,
        hitl_callback: HITLCallback,
    ) -> None:
        self._llm = llm
        self._risk_engine = risk_engine
        self._sandbox = sandbox
        self._audit = audit
        self._compressor = compressor
        self._hitl_callback = hitl_callback
        self._sessions: dict[str, list[LLMMessage]] = {}

    async def process_task(self, task_input: TaskInput) -> TaskResult:
        """Process a user task through the full orchestration pipeline.

        Flow: Build messages -> Compress -> LLM -> Parse tool_calls ->
              Risk assessment -> HITL if needed -> Execute -> Return result.
        """
        task_id = uuid4()
        session_id = task_input.session_id or str(task_id)

        result = TaskResult(
            task_id=task_id,
            status=TaskStatus.PENDING,
            user_message=task_input.user_message,
        )

        await self._audit.log_action(
            task_id, "task_received", command=task_input.user_message
        )

        history = self._sessions.setdefault(session_id, [])
        if not history:
            history.append(LLMMessage(role="system", content=SYSTEM_PROMPT))
        history.append(LLMMessage(role="user", content=task_input.user_message))

        compressed = self._compressor.compress(history)

        llm_response = await self._call_llm(task_id, compressed, result)
        if result.status == TaskStatus.FAILED:
            return result

        await self._audit.log_action(
            task_id,
            "llm_response",
            llm_provider=llm_response.provider,
            llm_raw_json=llm_response.model_dump_json(),
        )

        if not llm_response.tool_calls:
            return self._finalize_text(result, llm_response, history)

        tool_call = llm_response.tool_calls[0]
        result.command = tool_call.arguments.command

        risk = self._risk_engine.assess(
            tool_call.arguments.command, tool_call.arguments.working_dir
        )
        result.risk_score = risk.score
        await self._audit.log_action(
            task_id,
            "risk_assessed",
            command=tool_call.arguments.command,
            risk_score=risk.score,
            decision=risk.level,
        )

        if risk.level == RiskLevel.DENY:
            return self._deny(result, risk)

        if risk.level == RiskLevel.ASK:
            decision = await self._handle_hitl(task_id, tool_call.arguments.command, risk, result)
            if decision != HITLDecision.ALLOW:
                return result

        return await self._execute_command(task_id, tool_call, result, history)

    async def _call_llm(
        self, task_id: UUID, messages: list[LLMMessage], result: TaskResult
    ) -> LLMResponse:
        try:
            request = LLMRequest(messages=messages)
            response = await self._llm.complete(request)
            result.llm_response_raw = response.content
            return response
        except Exception as exc:
            logger.error("LLM call failed for task %s: %s", task_id, exc)
            result.status = TaskStatus.FAILED
            result.assistant_reply = f"LLM error: {exc}"
            result.completed_at = _utc_now()
            return LLMResponse(provider="error", model="none", usage_tokens=0)

    def _finalize_text(
        self, result: TaskResult, response: LLMResponse, history: list[LLMMessage]
    ) -> TaskResult:
        result.status = TaskStatus.COMPLETED
        result.assistant_reply = response.content or "No response from LLM."
        result.completed_at = _utc_now()
        history.append(LLMMessage(role="assistant", content=result.assistant_reply))
        return result

    def _deny(self, result: TaskResult, risk: RiskAssessment) -> TaskResult:
        result.status = TaskStatus.DENIED
        result.assistant_reply = (
            f"Command denied (risk score: {risk.score}): "
            f"{', '.join(risk.reasons)}"
        )
        result.completed_at = _utc_now()
        return result

    async def _handle_hitl(
        self, task_id: UUID, command: str, risk: RiskAssessment, result: TaskResult
    ) -> HITLDecision:
        result.status = TaskStatus.AWAITING_APPROVAL
        decision = await self._hitl_callback(task_id, command, risk)
        await self._audit.log_action(
            task_id, "hitl_decision", command=command, decision=decision
        )
        if decision != HITLDecision.ALLOW:
            result.status = TaskStatus.DENIED
            result.assistant_reply = f"Command {decision} by operator."
            result.completed_at = _utc_now()
        else:
            result.status = TaskStatus.APPROVED
        return decision

    async def _execute_command(
        self, task_id: UUID, tool_call: object, result: TaskResult, history: list[LLMMessage]
    ) -> TaskResult:
        result.status = TaskStatus.EXECUTING
        try:
            exec_result = await self._sandbox.execute_sandboxed(
                tool_call.arguments.command,  # type: ignore[attr-defined]
                tool_call.arguments.working_dir,  # type: ignore[attr-defined]
                tool_call.arguments.timeout,  # type: ignore[attr-defined]
            )
            result.execution = exec_result
            result.status = TaskStatus.COMPLETED
            reply = f"Command executed (exit code: {exec_result.exit_code}).\nOutput:\n{exec_result.stdout}"
            if exec_result.stderr:
                reply += f"\nStderr:\n{exec_result.stderr}"
            result.assistant_reply = reply
            await self._audit.log_action(
                task_id,
                "command_executed",
                command=tool_call.arguments.command,  # type: ignore[attr-defined]
                execution_result=exec_result.model_dump_json(),
            )
        except Exception as exc:
            logger.error("Execution failed for task %s: %s", task_id, exc)
            result.status = TaskStatus.FAILED
            result.assistant_reply = f"Execution error: {exc}"

        result.completed_at = _utc_now()
        if result.assistant_reply:
            history.append(LLMMessage(role="assistant", content=result.assistant_reply))
        return result
