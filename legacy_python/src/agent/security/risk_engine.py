"""Risk assessment engine for shell commands.

Evaluates commands against ``SecurityPolicies`` and produces a
``RiskAssessment`` with a numeric score, risk level, and human-readable
explanations.  Thresholds are tuned for single-user operation:

*  **ALLOW** – score 0-40 (benign commands, execute immediately)
*  **ASK**   – score 41-70 (requires human approval via HITL)
*  **DENY**  – score 71-100 (hard-blocked, never execute)
"""

from __future__ import annotations

import logging
from pathlib import PurePosixPath

from agent.domain.schemas.risk import RiskAssessment
from agent.security.policies import SecurityPolicies

logger = logging.getLogger(__name__)

# Extra score weight for commands targeting sensitive directories.
_SENSITIVE_DIRS: tuple[str, ...] = (
    "/etc", "/boot", "/usr", "/var", "/sys", "/proc",
    "/dev", "/root", "/sbin", "/bin",
)
_SENSITIVE_DIR_PENALTY: int = 15


class RiskEngine:
    """Evaluate command risk using policy-based pattern matching.

    Instantiate with a ``SecurityPolicies`` object, then call ``assess``
    for each command the agent proposes to execute.
    """

    __slots__ = ("_policies",)

    def __init__(self, policies: SecurityPolicies) -> None:
        self._policies: SecurityPolicies = policies

    def assess(self, command: str, working_dir: str = ".") -> RiskAssessment:
        """Produce a risk assessment for *command*.

        Args:
            command: The shell command string to evaluate.
            working_dir: Working directory context (used for directory
                         sensitivity scoring).

        Returns:
            A fully populated ``RiskAssessment`` instance.
        """
        # Evaluate against policy rules
        score, reasons, matched = self._policies.evaluate(command)

        # Apply directory-sensitivity bonus
        dir_penalty, dir_reasons = self._evaluate_directory(
            command, working_dir
        )
        score = min(score + dir_penalty, 100)
        reasons.extend(dir_reasons)

        level = RiskAssessment.compute_level(score)

        assessment = RiskAssessment(
            command=command,
            score=score,
            level=level,
            reasons=reasons,
            matched_policies=matched,
        )

        logger.info(
            "Risk assessment: score=%d level=%s command='%s'",
            score,
            level,
            command[:80],
        )
        return assessment

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _evaluate_directory(
        command: str,
        working_dir: str,
    ) -> tuple[int, list[str]]:
        """Add a penalty if the command or working directory references
        sensitive system paths.

        Returns:
            ``(penalty, reasons)`` tuple.
        """
        penalty: int = 0
        reasons: list[str] = []
        combined = f"{command} {working_dir}"

        for sensitive in _SENSITIVE_DIRS:
            if sensitive in combined:
                penalty = _SENSITIVE_DIR_PENALTY
                reasons.append(
                    f"DIRECTORY: references sensitive path '{sensitive}' "
                    f"(+{_SENSITIVE_DIR_PENALTY})"
                )
                break  # Apply penalty once regardless of count

        return penalty, reasons
