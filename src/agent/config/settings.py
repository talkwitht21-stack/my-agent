from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from agent.domain.enums import LLMProvider


class AppSettings(BaseSettings):
    """Application configuration loaded from environment variables and .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- API Server ---
    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8000)
    log_level: str = Field(default="INFO")

    # --- SSH (Client Node) ---
    ssh_host: str = Field(default="192.168.1.100")
    ssh_port: int = Field(default=22)
    ssh_user: str = Field(default="user")
    ssh_key_path: Path = Field(default=Path("~/.ssh/id_ed25519"))

    # --- Sandbox ---
    sandbox_root: str = Field(default="~/AI_Sandbox")

    # --- Database ---
    database_path: str = Field(default="./data/agent.db")

    # --- LLM ---
    groq_api_key: str = Field(default="")
    gemini_api_key: str = Field(default="")
    primary_llm: LLMProvider = Field(default=LLMProvider.GROQ)
    fallback_llm: LLMProvider = Field(default=LLMProvider.GEMINI)
    max_context_tokens: int = Field(default=4096)
    context_window_size: int = Field(default=10)

    @property
    def resolved_sandbox_root(self) -> str:
        """Return the raw sandbox root string. PathValidator handles cross-platform resolution."""
        return self.sandbox_root

    @property
    def resolved_database_path(self) -> Path:
        """Resolve DB path and ensure parent directory exists."""
        path = Path(self.database_path).resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def resolved_ssh_key_path(self) -> Path:
        """Expand ~ and resolve SSH key path."""
        return self.ssh_key_path.expanduser().resolve()
