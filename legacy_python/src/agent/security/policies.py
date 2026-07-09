"""Security policies for command risk evaluation.

Defines regex-based pattern groups that classify shell commands into risk tiers.
Each tier contributes a score delta used by the RiskEngine to compute a final
risk assessment.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class _PolicyRule:
    """A single policy rule mapping a regex pattern to a score delta."""

    name: str
    pattern: re.Pattern[str]
    score_delta: int


def _compile(name: str, raw: str, delta: int) -> _PolicyRule:
    """Compile a raw regex string into a frozen policy rule."""
    return _PolicyRule(
        name=name,
        pattern=re.compile(raw, re.IGNORECASE),
        score_delta=delta,
    )


@dataclass(frozen=True, slots=True)
class SecurityPolicies:
    """Immutable collection of command-risk policy rules.

    Pattern groups are ordered from most dangerous (DENY) to benign (LOW).
    The ``evaluate`` method tests a command against every rule and aggregates
    matched score deltas, reasons, and policy names.
    """

    deny_rules: tuple[_PolicyRule, ...] = field(default_factory=lambda: (
        _compile("deny_sudo", r"\bsudo\b", 100),
        _compile("deny_rm_rf_root", r"\brm\s+(-\w*r\w*f|-\w*f\w*r)\s+/\s*$", 100),
        _compile("deny_rm_slash", r"\brm\s+-\w*\s+/\s*$", 100),
        _compile("deny_mount", r"\bmount\b", 100),
        _compile("deny_umount", r"\bumount\b", 100),
        _compile("deny_mkfs", r"\bmkfs\b", 100),
        _compile("deny_dd", r"\bdd\b\s+.*\bof=", 100),
        _compile("deny_chmod_777", r"\bchmod\s+777\b", 100),
        _compile("deny_chown_root", r"\bchown\s+root\b", 100),
        _compile("deny_format", r"\bformat\b", 100),
        _compile("deny_fdisk", r"\bfdisk\b", 100),
        _compile("deny_parted", r"\bparted\b", 100),
        _compile("deny_reboot", r"\breboot\b", 100),
        _compile("deny_shutdown", r"\bshutdown\b", 100),
        _compile("deny_init", r"\binit\s+[0-6]\b", 100),
    ))

    high_risk_rules: tuple[_PolicyRule, ...] = field(default_factory=lambda: (
        _compile("high_curl_pipe_sh", r"\b(curl|wget)\b.*\|\s*(ba)?sh\b", 40),
        _compile("high_kill_9", r"\bkill\s+-9\b", 40),
        _compile("high_killall", r"\bkillall\b", 40),
        _compile("high_systemctl", r"\bsystemctl\b", 40),
        _compile("high_service", r"\bservice\b", 40),
        _compile("high_iptables", r"\biptables\b", 40),
        _compile("high_nft", r"\bnft\b", 40),
        _compile("high_crontab", r"\bcrontab\b", 40),
        _compile("high_eval", r"\beval\b", 40),
        _compile("high_exec_redirect", r">\s*/dev/sd", 40),
    ))

    medium_risk_rules: tuple[_PolicyRule, ...] = field(default_factory=lambda: (
        _compile("med_rm", r"\brm\b", 25),
        _compile("med_mv", r"\bmv\b", 25),
        _compile("med_cp_recursive", r"\bcp\s+-\w*r", 25),
        _compile("med_git_push", r"\bgit\s+push\b", 25),
        _compile("med_git_force", r"\bgit\s+.*--force\b", 25),
        _compile("med_pip_install", r"\bpip3?\s+install\b", 25),
        _compile("med_npm_install", r"\bnpm\s+install\b", 25),
        _compile("med_chmod", r"\bchmod\b", 25),
        _compile("med_chown", r"\bchown\b", 25),
        _compile("med_docker_run", r"\bdocker\s+run\b", 25),
    ))

    low_risk_rules: tuple[_PolicyRule, ...] = field(default_factory=lambda: (
        _compile("low_cat", r"\bcat\b", 0),
        _compile("low_ls", r"\bls\b", 0),
        _compile("low_echo", r"\becho\b", 0),
        _compile("low_pwd", r"\bpwd\b", 0),
        _compile("low_head", r"\bhead\b", 0),
        _compile("low_tail", r"\btail\b", 0),
        _compile("low_grep", r"\bgrep\b", 0),
        _compile("low_find", r"\bfind\b", 0),
        _compile("low_wc", r"\bwc\b", 0),
        _compile("low_date", r"\bdate\b", 0),
    ))

    def evaluate(self, command: str) -> tuple[int, list[str], list[str]]:
        """Evaluate a command against all policy rules.

        Returns:
            A tuple of ``(score_delta, reasons, matched_names)`` where
            ``score_delta`` is the cumulative risk score, ``reasons`` lists
            human-readable explanations, and ``matched_names`` lists the
            internal policy-rule identifiers that fired.
        """
        score: int = 0
        reasons: list[str] = []
        matched: list[str] = []

        all_rules = (
            self.deny_rules
            + self.high_risk_rules
            + self.medium_risk_rules
            + self.low_risk_rules
        )

        for rule in all_rules:
            if rule.pattern.search(command):
                score += rule.score_delta
                matched.append(rule.name)
                if rule.score_delta >= 100:
                    reasons.append(f"BLOCKED: '{rule.name}' matched (hard deny)")
                elif rule.score_delta >= 40:
                    reasons.append(f"HIGH RISK: '{rule.name}' matched (+{rule.score_delta})")
                elif rule.score_delta >= 25:
                    reasons.append(f"MEDIUM RISK: '{rule.name}' matched (+{rule.score_delta})")
                else:
                    reasons.append(f"LOW RISK: '{rule.name}' matched (safe)")

        # Cap at 100
        score = min(score, 100)
        return score, reasons, matched
