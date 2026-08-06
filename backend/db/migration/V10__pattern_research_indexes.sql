-- Indexes for pattern research (composable filter) query-time scans.
-- Plain CREATE INDEX (transaction-safe for Flyway-style apply). No CONCURRENTLY.

CREATE INDEX IF NOT EXISTS idx_pi_research_closed
  ON pattern_instances (symbol_id, pattern_type, timeframe, detect_candle_time)
  WHERE status IN ('succeeded', 'failed', 'expired');

CREATE INDEX IF NOT EXISTS idx_po_reason
  ON pattern_outcomes (reason)
  WHERE reason IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_po_final_outcome
  ON pattern_outcomes (final_outcome);
