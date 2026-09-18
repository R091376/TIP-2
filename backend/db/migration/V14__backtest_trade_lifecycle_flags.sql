-- Post-retest reclaim of fill/entry.
ALTER TABLE backtest_trades
    ADD COLUMN IF NOT EXISTS flag_entry_reached BOOLEAN NOT NULL DEFAULT FALSE;
