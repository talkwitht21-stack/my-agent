from __future__ import annotations

import asyncio
import json
import logging
from uuid import UUID

from fastapi import WebSocket, WebSocketDisconnect

from agent.domain.enums import HITLDecision
from agent.domain.schemas import RiskAssessment

logger = logging.getLogger(__name__)


class _PendingApproval:
    """Internal state for a pending HITL approval request."""

    def __init__(
        self,
        task_id: UUID,
        command: str,
        risk: RiskAssessment,
    ) -> None:
        self.task_id = task_id
        self.command = command
        self.risk = risk
        self.event: asyncio.Event = asyncio.Event()
        self.decision: HITLDecision = HITLDecision.TIMEOUT


class HITLManager:
    """WebSocket-based Human-in-the-Loop approval manager.

    Manages WebSocket connections from operator UIs and coordinates
    approval/denial decisions for commands that require human review.
    """

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []
        self._pending: dict[str, _PendingApproval] = {}
        self._logger = logging.getLogger(__name__)

    async def connect(self, websocket: WebSocket) -> None:
        """Accept and register a new WebSocket client."""
        await websocket.accept()
        self._connections.append(websocket)
        self._logger.info(
            "WebSocket client connected (%d total)", len(self._connections)
        )

    async def disconnect(self, websocket: WebSocket) -> None:
        """Unregister a disconnected WebSocket client."""
        if websocket in self._connections:
            self._connections.remove(websocket)
        self._logger.info(
            "WebSocket client disconnected (%d total)", len(self._connections)
        )

    async def request_approval(
        self,
        task_id: UUID,
        command: str,
        risk: RiskAssessment,
        timeout: float = 120.0,
    ) -> HITLDecision:
        """Send an approval request to connected clients and await response.

        Args:
            task_id: The task requiring approval.
            command: The command to be approved or denied.
            risk: Risk assessment details for the command.
            timeout: Maximum seconds to wait for a decision.

        Returns:
            The operator's decision, or TIMEOUT if no response received.
        """
        if not self._connections:
            self._logger.warning("No WebSocket clients connected, auto-denying")
            return HITLDecision.DENY

        pending = _PendingApproval(task_id=task_id, command=command, risk=risk)
        key = str(task_id)
        self._pending[key] = pending

        payload = json.dumps({
            "type": "approval_request",
            "task_id": key,
            "command": command,
            "risk_score": risk.score,
            "risk_level": risk.level,
            "reasons": risk.reasons,
            "matched_policies": risk.matched_policies,
        })

        disconnected: list[WebSocket] = []
        for ws in self._connections:
            try:
                await ws.send_text(payload)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            await self.disconnect(ws)

        try:
            await asyncio.wait_for(pending.event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            self._logger.warning("HITL approval timed out for task %s", key)
            pending.decision = HITLDecision.TIMEOUT
        finally:
            self._pending.pop(key, None)

        return pending.decision

    async def handle_message(self, websocket: WebSocket) -> None:
        """Process incoming WebSocket messages for approval decisions.

        Listens for JSON messages with type 'approval_response' containing
        task_id and decision ('allow' or 'deny') fields.
        """
        try:
            while True:
                data = await websocket.receive_text()
                try:
                    message: dict[str, str] = json.loads(data)
                except json.JSONDecodeError:
                    self._logger.warning("Invalid JSON from WebSocket client")
                    continue

                msg_type = message.get("type")
                if msg_type != "approval_response":
                    continue

                task_key = message.get("task_id", "")
                decision_str = message.get("decision", "")

                pending = self._pending.get(task_key)
                if pending is None:
                    self._logger.warning(
                        "No pending approval for task %s", task_key
                    )
                    continue

                if decision_str == "allow":
                    pending.decision = HITLDecision.ALLOW
                elif decision_str == "deny":
                    pending.decision = HITLDecision.DENY
                else:
                    self._logger.warning("Unknown decision: %s", decision_str)
                    pending.decision = HITLDecision.DENY

                pending.event.set()
                self._logger.info(
                    "HITL decision for task %s: %s",
                    task_key,
                    pending.decision,
                )
        except WebSocketDisconnect:
            await self.disconnect(websocket)
