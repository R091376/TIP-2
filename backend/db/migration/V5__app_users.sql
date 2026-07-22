-- App users (admin-managed) + cash ledger for paper trading foundation.

CREATE TABLE app_users (
    id              UUID PRIMARY KEY,
    username        VARCHAR(64)  NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(16)  NOT NULL,
    display_name    VARCHAR(128),
    cash_balance    NUMERIC(18, 2) NOT NULL DEFAULT 100000.00,
    trading_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_app_users_username UNIQUE (username),
    CONSTRAINT ck_app_users_role CHECK (role IN ('ADMIN', 'USER')),
    CONSTRAINT ck_app_users_cash_non_negative CHECK (cash_balance >= 0)
);

CREATE INDEX idx_app_users_role ON app_users (role);
CREATE INDEX idx_app_users_active ON app_users (active);

CREATE TABLE cash_ledger (
    id             UUID PRIMARY KEY,
    user_id        UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    entry_type     VARCHAR(32) NOT NULL,
    amount         NUMERIC(18, 2) NOT NULL,
    balance_after  NUMERIC(18, 2) NOT NULL,
    note           VARCHAR(512),
    created_at     TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_cash_ledger_type CHECK (
        entry_type IN ('SEED', 'RESET', 'ADJUST', 'BUY', 'SELL', 'FEE', 'SQUARE_OFF')
    )
);

CREATE INDEX idx_cash_ledger_user_created ON cash_ledger (user_id, created_at DESC);
