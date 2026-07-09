from __future__ import annotations

import logging
from pathlib import Path

from agent.domain.schemas import ExecutionResult
from agent.infrastructure.execution.ssh_client import SSHExecutor
from agent.security.path_validator import PathValidator

logger = logging.getLogger(__name__)


class SandboxRuntime:
    """Sandboxed command execution with path validation and confinement."""

    def __init__(
        self,
        ssh: SSHExecutor,
        sandbox_root: Path,
        path_validator: PathValidator,
    ) -> None:
        self._ssh = ssh
        self._sandbox_root = sandbox_root
        self._path_validator = path_validator

    async def execute_sandboxed(
        self,
        command: str,
        working_dir: str = ".",
        timeout: int = 30,
    ) -> ExecutionResult:
        """Execute a command within the validated sandbox boundary.

        Args:
            command: Shell command to execute.
            working_dir: Directory relative to sandbox root.
            timeout: Maximum execution time in seconds.

        Returns:
            ExecutionResult with exit code, output, and duration.
        """
        if not self._path_validator.validate(working_dir):
            logger.warning("Path validation failed for: %s", working_dir)
            return ExecutionResult(
                exit_code=126,
                stdout="",
                stderr=f"Path validation failed: {working_dir}",
                duration_ms=0.0,
                truncated=False,
            )

        resolved = self._path_validator.resolve_safe(working_dir)
        full_path = resolved

        # For Windows CMD, cd needs the /d flag to switch drives if we provide an absolute path
        if self._path_validator.is_windows:
            sandboxed_cmd = f'cd /d "{full_path}" && {command}'
        else:
            sandboxed_cmd = f'cd "{full_path}" && {command}'

        logger.info(
            "Sandboxed execution in %s: %.80s",
            full_path,
            command,
        )

        return await self._ssh.execute(
            command=sandboxed_cmd,
            working_dir=full_path,
            timeout=timeout,
        )
