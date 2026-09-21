-- V16__paper_trade_charges.sql

ALTER TABLE paper_fills
    ADD COLUMN IF NOT EXISTS charges_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS schedule_id VARCHAR(64) NOT NULL DEFAULT 'legacy',
    ADD COLUMN IF NOT EXISTS schedule_version INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS allocated_entry_charges NUMERIC(18, 2),
    -- Per-fill net P&L delta on close/cover fills only. NULL on entry fills.
    -- NEVER the lot's cumulative realized_pnl.
    ADD COLUMN IF NOT EXISTS realized_pnl NUMERIC(18, 2);

ALTER TABLE paper_position_lots
    ADD COLUMN IF NOT EXISTS charges_entry NUMERIC(18, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS charges_exit NUMERIC(18, 2) NOT NULL DEFAULT 0;

CREATE TABLE paper_fill_charges (
    id           UUID PRIMARY KEY,
    fill_id      UUID NOT NULL REFERENCES paper_fills (id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    code         VARCHAR(32) NOT NULL,
    amount       NUMERIC(18, 2) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_paper_fill_charges_code CHECK (code IN (
        'BROKERAGE', 'STT', 'EXCHANGE_TXN', 'SEBI', 'STAMP', 'GST', 'DP'
    )),
    CONSTRAINT ck_paper_fill_charges_amount CHECK (amount >= 0),
    CONSTRAINT uq_paper_fill_charges_fill_code UNIQUE (fill_id, code)
);

CREATE INDEX idx_paper_fill_charges_user ON paper_fill_charges (user_id, created_at DESC);
