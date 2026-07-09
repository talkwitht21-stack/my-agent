from __future__ import annotations

from pydantic import BaseModel, Field

from agent.domain.enums import RiskLevel


class RiskAssessment(BaseModel):
    """Risk assessment result for a command."""

    command: str = Field(description="The command being assessed")
    score: int = Field(ge=0, le=100, description="Risk score 0-100")
    level: RiskLevel = Field(description="Computed risk level")
    reasons: list[str] = Field(default_factory=list, description="Risk factors identified")
    matched_policies: list[str] = Field(
        default_factory=list, description="Matched policy names"
    )

    @staticmethod
    def compute_level(score: int) -> RiskLevel:
        """Map numeric score to risk level: ALLOW(0-40), ASK(41-70), DENY(71+)."""
        if score <= 40:
            return RiskLevel.ALLOW
        if score <= 70:
            return RiskLevel.ASK
        return RiskLevel.DENY
