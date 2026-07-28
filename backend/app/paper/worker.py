"""Dedicated paper matcher worker — non-blocking enqueue from event loop."""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from typing import TYPE_CHECKING

from app.market.models import Tick

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


class PaperMatcherWorker:
    """
    Coalesces latest tick per symbol and wakes a worker thread.
    Callback `on_symbol_ticks` receives list[(instrument_key, Tick)].
    """

    def __init__(
        self,
        on_drain: Callable[[dict[str, Tick]], None],
        *,
        poll_interval_s: float = 0.05,
        square_off_check: Callable[[], None] | None = None,
        square_off_interval_s: float = 5.0,
    ) -> None:
        self._on_drain = on_drain
        self._square_off_check = square_off_check
        self._square_off_interval_s = square_off_interval_s
        self._pending: dict[str, Tick] = {}
        self._lock = threading.Lock()
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._poll_interval_s = poll_interval_s
        self._drops = 0

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="paper-matcher", daemon=True)
        self._thread.start()
        logger.info("Paper matcher worker started")

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3.0)
        self._thread = None
        logger.info("Paper matcher worker stopped")

    def enqueue_tick(self, tick: Tick) -> None:
        """Non-blocking; safe from asyncio event loop."""
        try:
            with self._lock:
                self._pending[tick.instrument_key] = tick
            self._wake.set()
        except Exception:
            logger.exception("paper enqueue_tick failed")

    def _run(self) -> None:
        last_sq = 0.0
        while not self._stop.is_set():
            self._wake.wait(timeout=self._poll_interval_s)
            self._wake.clear()
            batch: dict[str, Tick] = {}
            with self._lock:
                if self._pending:
                    batch = self._pending
                    self._pending = {}
            if batch:
                try:
                    self._on_drain(batch)
                except Exception:
                    logger.exception("paper matcher drain failed")
            now = time.monotonic()
            if self._square_off_check and (now - last_sq) >= self._square_off_interval_s:
                last_sq = now
                try:
                    self._square_off_check()
                except Exception:
                    logger.exception("paper square-off check failed")
