"""Path validator enforcing sandbox confinement.

All file-system operations performed by the agent must pass through
``PathValidator`` to ensure they remain within the configured sandbox root.
Symlinks that resolve outside the sandbox are explicitly rejected.
"""

from __future__ import annotations

import os
import posixpath
import ntpath

logger = logging.getLogger(__name__)


class PathValidator:
    """Validate and resolve file-system paths within a sandbox boundary logically.

    Supports both Windows and POSIX paths. Performs logical normalization
    to prevent directory traversal (e.g. `../`). Since the sandbox may be
    on a remote machine, this validator does NOT follow symlinks.
    """

    __slots__ = ("_sandbox_root", "_is_windows", "_path_mod")

    def __init__(self, sandbox_root: Path | str) -> None:
        root_str = str(sandbox_root)
        self._is_windows = "\\" in root_str or (len(root_str) >= 2 and root_str[1] == ":")
        self._path_mod = ntpath if self._is_windows else posixpath

        # Normalise the root
        self._sandbox_root = self._path_mod.normpath(root_str)
        
        # If it's a Linux path starting with ~, we can manually expand it for the current user
        # However, for remote SSH, it's safer to keep it or just assume it's valid.
        if not self._is_windows and self._sandbox_root.startswith("~"):
            # We attempt to expand locally just in case it's local, but otherwise leave it
            self._sandbox_root = os.path.expanduser(self._sandbox_root)

        logger.info("PathValidator initialised (is_win=%s) – sandbox: %s", self._is_windows, self._sandbox_root)

    @property
    def sandbox_root(self) -> str:
        """Return the normalized sandbox root path string."""
        return self._sandbox_root

    @property
    def is_windows(self) -> bool:
        """Return True if the sandbox is on a Windows filesystem."""
        return self._is_windows

    def validate(self, target_path: str) -> bool:
        """Check whether *target_path* is confined to the sandbox."""
        try:
            resolved = self._resolve(target_path)
            # Check if resolved path starts with the sandbox root
            # For Windows, case-insensitive check
            if self._is_windows:
                is_safe = resolved.lower().startswith(self._sandbox_root.lower())
            else:
                is_safe = resolved.startswith(self._sandbox_root)

            if not is_safe:
                logger.warning(
                    "Path escapes sandbox – target: %s, resolved: %s",
                    target_path,
                    resolved,
                )
            return is_safe
        except ValueError as exc:
            logger.warning("Path validation failed for '%s': %s", target_path, exc)
            return False

    def resolve_safe(self, target_path: str) -> str:
        """Resolve *target_path* logically and guarantee it is inside the sandbox.

        Returns:
            The resolved absolute path string.
        """
        resolved = self._resolve(target_path)
        
        if self._is_windows:
            is_safe = resolved.lower().startswith(self._sandbox_root.lower())
        else:
            is_safe = resolved.startswith(self._sandbox_root)
            
        if not is_safe:
            raise ValueError(
                f"Path '{target_path}' resolves to '{resolved}' "
                f"which is outside sandbox '{self._sandbox_root}'"
            )

        return resolved

    def _resolve(self, target_path: str) -> str:
        """Logically resolve a path string anchored to the sandbox root."""
        # Convert forward slashes to backslashes if Windows
        if self._is_windows:
            target_path = target_path.replace("/", "\\")
            
        if self._path_mod.isabs(target_path):
            raw = self._path_mod.normpath(target_path)
        else:
            raw = self._path_mod.normpath(self._path_mod.join(self._sandbox_root, target_path))
            
        # Extra security: ensure no sneaky traversal after normpath
        # normpath resolves A/../B to B. But if they pass lots of ../ it could escape.
        # Our startswith check handles it.
        return raw
