"""Path validator enforcing sandbox confinement.

All file-system operations performed by the agent must pass through
``PathValidator`` to ensure they remain within the configured sandbox root.
Symlinks that resolve outside the sandbox are explicitly rejected.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class PathValidator:
    """Validate and resolve file-system paths within a sandbox boundary.

    Every path is resolved to its real, absolute form and checked against
    the sandbox root using ``Path.is_relative_to``.  Symlinks that point
    outside the sandbox are blocked even if the initial path appears valid.
    """

    __slots__ = ("_sandbox_root",)

    def __init__(self, sandbox_root: Path) -> None:
        self._sandbox_root: Path = sandbox_root.expanduser().resolve()
        logger.info("PathValidator initialised – sandbox: %s", self._sandbox_root)

    @property
    def sandbox_root(self) -> Path:
        """Return the resolved sandbox root path."""
        return self._sandbox_root

    def validate(self, target_path: str) -> bool:
        """Check whether *target_path* is confined to the sandbox.

        Args:
            target_path: Raw path string (absolute or relative) to validate.

        Returns:
            ``True`` if the resolved path is inside the sandbox, ``False``
            otherwise.
        """
        try:
            resolved = self._resolve(target_path)
            is_safe = resolved.is_relative_to(self._sandbox_root)
            if not is_safe:
                logger.warning(
                    "Path escapes sandbox – target: %s, resolved: %s",
                    target_path,
                    resolved,
                )
            return is_safe
        except (OSError, ValueError) as exc:
            logger.warning("Path validation failed for '%s': %s", target_path, exc)
            return False

    def resolve_safe(self, target_path: str) -> Path:
        """Resolve *target_path* and guarantee it is inside the sandbox.

        Args:
            target_path: Raw path string to resolve.

        Returns:
            The resolved ``Path`` object.

        Raises:
            ValueError: If the resolved path escapes the sandbox or if
                        resolution itself fails (e.g. broken symlink).
        """
        try:
            resolved = self._resolve(target_path)
        except OSError as exc:
            raise ValueError(
                f"Cannot resolve path '{target_path}': {exc}"
            ) from exc

        if not resolved.is_relative_to(self._sandbox_root):
            raise ValueError(
                f"Path '{target_path}' resolves to '{resolved}' "
                f"which is outside sandbox '{self._sandbox_root}'"
            )

        return resolved

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _resolve(self, target_path: str) -> Path:
        """Resolve a raw path string to an absolute, real path.

        Relative paths are anchored to the sandbox root.  The resolution
        follows symlinks so that any link escaping the sandbox is detected.
        """
        raw = Path(target_path)
        if not raw.is_absolute():
            raw = self._sandbox_root / raw
        return raw.resolve()
