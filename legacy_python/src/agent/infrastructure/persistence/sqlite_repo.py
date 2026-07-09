from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from uuid import UUID

import aiosqlite

from agent.domain.schemas import AuditQuery, AuditRecord

logger = logging.getLogger(__name__)

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    action TEXT NOT NULL,
    command TEXT,
    risk_score INTEGER,
    decision TEXT,
    llm_provider TEXT,
    llm_raw_json TEXT,
    execution_result TEXT,
    content_hash TEXT NOT NULL
)
"""

_CREATE_IDX_TASK = (
    "CREATE INDEX IF NOT EXISTS idx_audit_task_id ON audit_logs(task_id)"
)
_CREATE_IDX_ACTION = (
    "CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action)"
)

_INSERT_SQL = """
INSERT INTO audit_logs
    (id, task_id, timestamp, action, command, risk_score,
     decision, llm_provider, llm_raw_json, execution_result, content_hash)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""


class SQLiteRepository:
    """Async SQLite repository for audit log persistence."""

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._db: aiosqlite.Connection | None = None

    async def initialize(self) -> None:
        """Create database connection and ensure schema exists."""
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db = await aiosqlite.connect(str(self._db_path))
        self._db.row_factory = aiosqlite.Row
        await self._db.execute("PRAGMA journal_mode=WAL")
        await self._db.execute(_CREATE_TABLE_SQL)
        await self._db.execute(_CREATE_IDX_TASK)
        await self._db.execute(_CREATE_IDX_ACTION)
        await self._db.commit()
        logger.info("SQLite repository initialized at %s", self._db_path)

    async def insert_audit(self, record: AuditRecord) -> None:
        """Persist a single audit record."""
        if self._db is None:
            raise RuntimeError("Repository not initialized. Call initialize() first.")

        await self._db.execute(
            _INSERT_SQL,
            (
                str(record.id),
                str(record.task_id),
                record.timestamp.isoformat(),
                record.action,
                record.command,
                record.risk_score,
                record.decision,
                record.llm_provider,
                record.llm_raw_json,
                record.execution_result,
                record.content_hash,
            ),
        )
        await self._db.commit()
        logger.debug("Audit record inserted: %s [%s]", record.id, record.action)

    async def query_audits(self, query: AuditQuery) -> list[AuditRecord]:
        """Query audit records with optional filters, pagination, and ordering."""
        if self._db is None:
            raise RuntimeError("Repository not initialized. Call initialize() first.")

        clauses: list[str] = []
        params: list[str | int] = []

        if query.task_id is not None:
            clauses.append("task_id = ?")
            params.append(str(query.task_id))
        if query.action is not None:
            clauses.append("action = ?")
            params.append(query.action)

        where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = (
            f"SELECT * FROM audit_logs{where} "
            f"ORDER BY timestamp DESC LIMIT ? OFFSET ?"
        )
        params.extend([query.limit, query.offset])

        cursor = await self._db.execute(sql, params)
        rows = await cursor.fetchall()
        return [self._row_to_record(row) for row in rows]

    async def get_task_audits(self, task_id: UUID) -> list[AuditRecord]:
        """Retrieve all audit records for a specific task."""
        return await self.query_audits(AuditQuery(task_id=task_id, limit=500))

    async def close(self) -> None:
        """Close the database connection."""
        if self._db is not None:
            await self._db.close()
            self._db = None
            logger.info("SQLite repository closed")

    @staticmethod
    def _row_to_record(row: aiosqlite.Row) -> AuditRecord:
        """Map a database row to an AuditRecord domain object."""
        return AuditRecord(
            id=UUID(row["id"]),
            task_id=UUID(row["task_id"]),
            timestamp=datetime.fromisoformat(row["timestamp"]),
            action=row["action"],
            command=row["command"],
            risk_score=row["risk_score"],
            decision=row["decision"],
            llm_provider=row["llm_provider"],
            llm_raw_json=row["llm_raw_json"],
            execution_result=row["execution_result"],
            content_hash=row["content_hash"],
        )
