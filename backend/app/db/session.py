from __future__ import annotations

import logging
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

logger = logging.getLogger(__name__)


def create_engine_and_session(database_url: str) -> tuple[Engine, sessionmaker[Session]]:
    from app.config import normalize_sqlalchemy_url

    url = normalize_sqlalchemy_url(database_url)
    engine = create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    return engine, factory


def apply_flyway_sql(engine: Engine, migration_dir: str | Path) -> None:
    """Apply V*.sql files in order; track versions in tip_schema_history.

    Compatible with an existing Java Flyway database (flyway_schema_history versions 1..N).
    """
    mig_dir = Path(migration_dir)
    if not mig_dir.is_dir():
        logger.warning("Migration dir not found: %s", mig_dir)
        return
    files = sorted(mig_dir.glob("V*.sql"))
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS tip_schema_history ("
                "version VARCHAR(64) PRIMARY KEY, "
                "applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
            )
        )

        # Mark migrations already applied by Java Flyway as done
        flyway = conn.execute(
            text("SELECT to_regclass('public.flyway_schema_history')")
        ).scalar()
        if flyway:
            for f in files:
                num = _version_number(f.name)
                if not num:
                    continue
                present = conn.execute(
                    text(
                        "SELECT 1 FROM flyway_schema_history "
                        "WHERE success = true AND version = :v"
                    ),
                    {"v": num},
                ).first()
                if present:
                    conn.execute(
                        text(
                            "INSERT INTO tip_schema_history(version) VALUES (:v) "
                            "ON CONFLICT (version) DO NOTHING"
                        ),
                        {"v": f.name},
                    )
                    logger.info(
                        "Recognized existing Flyway V%s as applied: %s", num, f.name
                    )

        for f in files:
            version = f.name
            exists = conn.execute(
                text("SELECT 1 FROM tip_schema_history WHERE version = :v"),
                {"v": version},
            ).first()
            if exists:
                continue
            sql = f.read_text(encoding="utf-8")
            try:
                for stmt in _split_sql(sql):
                    if stmt.strip():
                        conn.execute(text(stmt))
                conn.execute(
                    text("INSERT INTO tip_schema_history(version) VALUES (:v)"),
                    {"v": version},
                )
                logger.info("Applied migration %s", version)
            except Exception as e:
                msg = str(e).lower()
                if "already exists" in msg or "duplicate" in msg:
                    conn.execute(
                        text(
                            "INSERT INTO tip_schema_history(version) VALUES (:v) "
                            "ON CONFLICT (version) DO NOTHING"
                        ),
                        {"v": version},
                    )
                    logger.warning(
                        "Migration %s objects already present; marked applied",
                        version,
                    )
                else:
                    raise


def _version_number(filename: str) -> str | None:
    if not filename.startswith("V"):
        return None
    num: list[str] = []
    for ch in filename[1:]:
        if ch.isdigit():
            num.append(ch)
        else:
            break
    return "".join(num) if num else None


def _split_sql(sql: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    for line in sql.splitlines():
        stripped = line.strip()
        if stripped.startswith("--"):
            continue
        buf.append(line)
        if stripped.endswith(";"):
            parts.append("\n".join(buf))
            buf = []
    if buf:
        parts.append("\n".join(buf))
    return parts
