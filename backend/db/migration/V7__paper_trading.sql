-- Manual paper trading OMS (orders, fills, position lots, cash locks).

CREATE TABLE paper_orders (
    id                   UUID PRIMARY KEY,
    user_id              UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    client_order_id      VARCHAR(64),
    instrument_key       TEXT NOT NULL,
    trading_symbol       VARCHAR(64) NOT NULL,
    side                 VARCHAR(8) NOT NULL,
    order_type           VARCHAR(8) NOT NULL,
    working_order_type   VARCHAR(8) NOT NULL,
    product              VARCHAR(8) NOT NULL,
    qty                  INT NOT NULL,
    filled_qty           INT NOT NULL DEFAULT 0,
    price                NUMERIC(18, 4),
    trigger_price        NUMERIC(18, 4),
    status               VARCHAR(32) NOT NULL,
    reject_reason        VARCHAR(256),
    close_lot_id         UUID,
    source               VARCHAR(32) NOT NULL DEFAULT 'USER',
    accept_seq           BIGINT NOT NULL,
    accepted_at          TIMESTAMPTZ,
    accepted_tick_ms     BIGINT,
    triggered_at         TIMESTAMPTZ,
    completed_at         TIMESTAMPTZ,
    version              INT NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ NOT NULL,
    updated_at           TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_paper_orders_side CHECK (side IN ('BUY', 'SELL')),
    CONSTRAINT ck_paper_orders_type CHECK (order_type IN ('MARKET', 'LIMIT', 'SL', 'SL_M')),
    CONSTRAINT ck_paper_orders_working CHECK (working_order_type IN ('MARKET', 'LIMIT', 'NONE')),
    CONSTRAINT ck_paper_orders_product CHECK (product IN ('MIS', 'CNC')),
    CONSTRAINT ck_paper_orders_status CHECK (status IN (
        'OPEN', 'TRIGGER_PENDING', 'PARTIALLY_FILLED',
        'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'
    )),
    CONSTRAINT ck_paper_orders_qty CHECK (qty >= 1 AND filled_qty >= 0 AND filled_qty <= qty),
    CONSTRAINT uq_paper_orders_client UNIQUE (user_id, client_order_id)
);

CREATE INDEX idx_paper_orders_user_status ON paper_orders (user_id, status);
CREATE INDEX idx_paper_orders_symbol_status ON paper_orders (instrument_key, status);
CREATE INDEX idx_paper_orders_close_lot ON paper_orders (close_lot_id);

CREATE TABLE paper_fills (
    id              UUID PRIMARY KEY,
    order_id        UUID NOT NULL REFERENCES paper_orders (id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    instrument_key  TEXT NOT NULL,
    side            VARCHAR(8) NOT NULL,
    qty             INT NOT NULL,
    price           NUMERIC(18, 4) NOT NULL,
    amount          NUMERIC(18, 2) NOT NULL,
    tick_ts_ms      BIGINT NOT NULL,
    lot_id          UUID,
    created_at      TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_paper_fills_side CHECK (side IN ('BUY', 'SELL')),
    CONSTRAINT ck_paper_fills_qty CHECK (qty >= 1)
);

CREATE INDEX idx_paper_fills_user_created ON paper_fills (user_id, created_at DESC);
CREATE INDEX idx_paper_fills_order ON paper_fills (order_id);

CREATE TABLE paper_position_lots (
    id               UUID PRIMARY KEY,
    user_id          UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    instrument_key   TEXT NOT NULL,
    trading_symbol   VARCHAR(64) NOT NULL,
    side             VARCHAR(8) NOT NULL,
    product          VARCHAR(8) NOT NULL,
    qty_open         INT NOT NULL,
    qty_closed       INT NOT NULL DEFAULT 0,
    avg_entry_price  NUMERIC(18, 4) NOT NULL,
    realized_pnl     NUMERIC(18, 2) NOT NULL DEFAULT 0,
    status           VARCHAR(16) NOT NULL,
    entry_order_id   UUID REFERENCES paper_orders (id),
    opened_at        TIMESTAMPTZ NOT NULL,
    closed_at        TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_paper_lots_side CHECK (side IN ('LONG', 'SHORT')),
    CONSTRAINT ck_paper_lots_product CHECK (product IN ('MIS', 'CNC')),
    CONSTRAINT ck_paper_lots_status CHECK (status IN ('OPEN', 'CLOSED')),
    CONSTRAINT ck_paper_lots_qty CHECK (qty_open >= 0 AND qty_closed >= 0)
);

CREATE INDEX idx_paper_lots_user_status ON paper_position_lots (user_id, status);

CREATE TABLE paper_cash_locks (
    id           UUID PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    amount       NUMERIC(18, 2) NOT NULL,
    reason       VARCHAR(32) NOT NULL,
    order_id     UUID REFERENCES paper_orders (id) ON DELETE CASCADE,
    lot_id       UUID REFERENCES paper_position_lots (id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL,
    released_at  TIMESTAMPTZ,
    CONSTRAINT ck_paper_locks_amount CHECK (amount >= 0),
    CONSTRAINT ck_paper_locks_reason CHECK (reason IN ('ORDER', 'SHORT_MARGIN')),
    CONSTRAINT ck_paper_locks_fk CHECK (
        (reason = 'ORDER' AND order_id IS NOT NULL AND lot_id IS NULL)
        OR (reason = 'SHORT_MARGIN' AND lot_id IS NOT NULL AND order_id IS NULL)
    )
);

CREATE INDEX idx_paper_locks_user_open ON paper_cash_locks (user_id)
    WHERE released_at IS NULL;

CREATE TABLE paper_square_off_runs (
    trade_date   DATE NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (trade_date)
);
