-- Dual P&L on simulated backtest trades. pnl / r_multiple stay GROSS.
ALTER TABLE backtest_trades
    ADD COLUMN IF NOT EXISTS pnl_net DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS charges_entry DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS charges_exit DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS r_multiple_net DOUBLE PRECISION;
