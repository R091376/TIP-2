from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON, TypeDecorator, Uuid

from app.db.base import Base


class GUID(TypeDecorator):
    """Platform-independent UUID type."""

    impl = Uuid
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PGUUID(as_uuid=True))
        return dialect.type_descriptor(String(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if dialect.name == "postgresql":
            return value if isinstance(value, UUID) else UUID(str(value))
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if isinstance(value, UUID):
            return value
        return UUID(str(value))


class JSONType(TypeDecorator):
    """JSONB on Postgres, JSON elsewhere."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(JSON())


class PatternInstanceRow(Base):
    __tablename__ = "pattern_instances"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    symbol_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    pattern_type: Mapped[str] = mapped_column(Text, nullable=False)
    timeframe: Mapped[str] = mapped_column(Text, nullable=False)
    direction: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    flag_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    flag_retested: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    flag_strengthened: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    volume_ok_at_detect: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reference_level: Mapped[float] = mapped_column(Float, nullable=False)
    lookback_high: Mapped[float] = mapped_column(Float, nullable=False)
    atr_at_detect: Mapped[float] = mapped_column(Float, nullable=False)
    volume_at_detect: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    confirmation_mode_used: Mapped[str | None] = mapped_column(Text, nullable=True)
    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    stop_level: Mapped[float] = mapped_column(Float, nullable=False)
    target_level: Mapped[float | None] = mapped_column(Float, nullable=True)
    retest_floor: Mapped[float | None] = mapped_column(Float, nullable=True)
    detector_version: Mapped[str] = mapped_column(Text, nullable=False)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    detect_candle_time: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sessions_seen: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PatternEventRow(Base):
    __tablename__ = "pattern_events"
    __table_args__ = (
        UniqueConstraint("pattern_instance_id", "event_type", name="uq_pattern_events_instance_stage"),
    )

    # Integer PK works for SQLite autoincrement + Postgres BIGSERIAL via Flyway
    id: Mapped[int | None] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pattern_instance_id: Mapped[UUID] = mapped_column(
        GUID(), ForeignKey("pattern_instances.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    event_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    candle_time: Mapped[int] = mapped_column(BigInteger, nullable=False)
    price_at_event: Mapped[float] = mapped_column(Float, nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column("metadata", JSONType(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PatternOutcomeRow(Base):
    __tablename__ = "pattern_outcomes"

    pattern_instance_id: Mapped[UUID] = mapped_column(
        GUID(), ForeignKey("pattern_instances.id", ondelete="CASCADE"), primary_key=True
    )
    final_outcome: Mapped[str] = mapped_column(Text, nullable=False)
    duration_candles: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_seconds: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    max_favorable_r: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_adverse_r: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_favorable_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_adverse_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    move_r: Mapped[float | None] = mapped_column(Float, nullable=True)
    end_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    closed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PatternStatisticsRow(Base):
    __tablename__ = "pattern_statistics"

    symbol_id: Mapped[str] = mapped_column(Text, primary_key=True)
    pattern_type: Mapped[str] = mapped_column(Text, primary_key=True)
    timeframe: Mapped[str] = mapped_column(Text, primary_key=True)
    sample_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    success_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fail_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expired_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    success_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    resolved_success_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_move_r: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    avg_duration_candles: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    avg_mfe_r: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    avg_mae_r: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    move_sample_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    mfe_sample_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    mae_sample_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    avg_planned_rr: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    avg_risk_r: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    avg_reward_r: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    planned_rr_sample_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    min_planned_rr: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    max_planned_rr: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    median_planned_rr: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
