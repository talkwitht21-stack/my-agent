from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path
from types import TracebackType

import asyncssh

from agent.domain.schemas import ExecutionResult

logger = logging.getLogger(__name__)


class SSHExecutor:
    """Async SSH client for remote command execution via AsyncSSH."""

    MAX_OUTPUT_CHARS: int = 4096

    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        key_path: Path,
    ) -> None:
        self._host = host
        self._port = port
        self._username = username
        self._key_path = key_path
        self._connection: asyncssh.SSHClientConnection | None = None

    async def connect(self) -> None:
        """Establish an AsyncSSH connection using Ed25519 key authentication."""
        self._connection = await asyncssh.connect(
            host=self._host,
            port=self._port,
            username=self._username,
            client_keys=[str(self._key_path)],
            known_hosts=None,
        )
        logger.info(
            "SSH connection established to %s@%s:%d",
            self._username,
            self._host,
            self._port,
        )

    async def execute(
        self,
        command: str,
        working_dir: str,
        timeout: int = 30,
    ) -> ExecutionResult:
        """Run a command remotely, capturing stdout/stderr with timeout enforcement."""
        if self._connection is None:
            raise RuntimeError("SSH connection not established. Call connect() first.")

        start = time.perf_counter()

        try:
            result = await asyncio.wait_for(
                self._connection.run(command, check=False),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            elapsed_ms = (time.perf_counter() - start) * 1000
            logger.warning(
                "Command timed out after %dms: %.80s", int(elapsed_ms), command
            )
            return ExecutionResult(
                exit_code=-1,
                stdout="",
                stderr=f"Command timed out after {timeout}s",
                duration_ms=elapsed_ms,
                truncated=False,
            )

        elapsed_ms = (time.perf_counter() - start) * 1000

        stdout = result.stdout or ""
        stderr = result.stderr or ""
        truncated = False

        if len(stdout) > self.MAX_OUTPUT_CHARS:
            stdout = stdout[: self.MAX_OUTPUT_CHARS]
            truncated = True
        if len(stderr) > self.MAX_OUTPUT_CHARS:
            stderr = stderr[: self.MAX_OUTPUT_CHARS]
            truncated = True

        exit_code = result.exit_status if result.exit_status is not None else -1

        logger.info(
            "Command executed (exit=%d, %.0fms, trunc=%s): %.80s",
            exit_code,
            elapsed_ms,
            truncated,
            command,
        )

        return ExecutionResult(
            exit_code=exit_code,
            stdout=stdout,
            stderr=stderr,
            duration_ms=elapsed_ms,
            truncated=truncated,
        )

    async def disconnect(self) -> None:
        """Gracefully close the SSH connection."""
        if self._connection is not None:
            self._connection.close()
            self._connection = None
            logger.info("SSH connection closed")

    async def __aenter__(self) -> SSHExecutor:
        await self.connect()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        await self.disconnect()
