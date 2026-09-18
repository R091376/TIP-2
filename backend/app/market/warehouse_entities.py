from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.journal.entities import GUID, JSONType


class MarketCandleRow(Base):
    __tablename__ = "market_candles"

    instrument_key: Mapped[str] = mapped_column(Text, primary_key=True)
    timeframe: Mapped[str] = mapped_column(Text, primary_key=True)
    time: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    open: Mapped[float] = mapped_column(Float, nullable=False)
    high: Mapped[float] = mapped_column(Float, nullable=False)
    low: Mapped[float] = mapped_column(Float, nullable=False)
    close: Mapped[float] = mapped_column(Float, nullable=False)
    volume: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    source: Mapped[str] = mapped_column(Text, nullable=False, default="historical")
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class MarketCandleCoverageRow(Base):
    __tablename__ = "market_candle_coverage"

    instrument_key: Mapped[str] = mapped_column(Text, primary_key=True)
    timeframe: Mapped[str] = mapped_column(Text, primary_key=True)
    from_time: Mapped[int] = mapped_column(BigInteger, nullable=False)
    to_time: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class BacktestRunRow(Base):
    __tablename__ = "backtest_runs"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    created_by: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    spec_json: Mapped[dict] = mapped_column(JSONType(), nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_json: Mapped[dict | None] = mapped_column(JSONType(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class BacktestTradeRow(Base):
    __tablename__ = "backtest_trades"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    run_id: Mapped[UUID] = mapped_column(
        GUID(), ForeignKey("backtest_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    symbol_id: Mapped[str] = mapped_column(Text, nullable=False)
    trading_symbol: Mapped[str | None] = mapped_column(Text, nullable=True)
    timeframe: Mapped[str] = mapped_column(Text, nullable=False)
    pattern_type: Mapped[str] = mapped_column(Text, nullable=False)
    direction: Mapped[str] = mapped_column(Text, nullable=False)
    detect_time: Mapped[int] = mapped_column(BigInteger, nullable=False)
    entry_time: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    exit_time: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    entry: Mapped[float | None] = mapped_column(Float, nullable=True)
    stop: Mapped[float | None] = mapped_column(Float, nullable=True)
    target: Mapped[float | None] = mapped_column(Float, nullable=True)
    fill_entry: Mapped[float | None] = mapped_column(Float, nullable=True)
    fill_exit: Mapped[float | None] = mapped_column(Float, nullable=True)
    outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    r_multiple: Mapped[float | None] = mapped_column(Float, nullable=True)
    pnl: Mapped[float | None] = mapped_column(Float, nullable=True)
    qty: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    flag_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    flag_retested: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    flag_entry_reached: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    volume_ok: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    mfe_r: Mapped[float | None] = mapped_column(Float, nullable=True)
    mae_r: Mapped[float | None] = mapped_column(Float, nullable=True)
    instance_id: Mapped[str | None] = mapped_column(Text, nullable=True)
