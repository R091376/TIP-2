-- Pattern Intelligence journal (MVP). symbol_id = Upstox instrument_key (KD27 joins).

CREATE TABLE pattern_instances (
    id                      UUID PRIMARY KEY,
    symbol_id               TEXT NOT NULL REFERENCES watchlist_symbols(symbol_id),
    pattern_type            TEXT NOT NULL,
    timeframe               TEXT NOT NULL,
    direction               TEXT NOT NULL,
    status                  TEXT NOT NULL,
    flag_confirmed          BOOLEAN NOT NULL DEFAULT false,
    flag_retested           BOOLEAN NOT NULL DEFAULT false,
    flag_strengthened       BOOLEAN NOT NULL DEFAULT false,
    volume_ok_at_detect     BOOLEAN NOT NULL DEFAULT false,
    reference_level         DOUBLE PRECISION NOT NULL,
    lookback_high           DOUBLE PRECISION NOT NULL,
    atr_at_detect           DOUBLE PRECISION NOT NULL,
    volume_at_detect        BIGINT NOT NULL DEFAULT 0,
    confirmation_mode_used  TEXT,
    entry_price             DOUBLE PRECISION NOT NULL,
    stop_level              DOUBLE PRECISION NOT NULL,
    target_level            DOUBLE PRECISION,
    retest_floor            DOUBLE PRECISION,
    detector_version        TEXT NOT NULL,
    detected_at             TIMESTAMPTZ NOT NULL,
    confirmed_at            TIMESTAMPTZ,
    ended_at                TIMESTAMPTZ,
    detect_candle_time      BIGINT NOT NULL,
    sessions_seen           INT NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_pattern_instances_type
        CHECK (pattern_type IN ('breakout', 'breakdown', 'consolidation', 'volume_breakout')),
    CONSTRAINT chk_pattern_instances_direction
        CHECK (direction IN ('long', 'short')),
    CONSTRAINT chk_pattern_instances_status
        CHECK (status IN (
            'detected', 'confirmed', 'retested', 'strengthened',
            'succeeded', 'failed', 'expired'
        ))
);

CREATE UNIQUE INDEX uq_pattern_detect_fingerprint
    ON pattern_instances (
        symbol_id, pattern_type, timeframe, detect_candle_time, reference_level
    );

CREATE INDEX idx_pattern_instances_symbol_type_tf_status
    ON pattern_instances (symbol_id, pattern_type, timeframe, status);

CREATE INDEX idx_pattern_instances_open
    ON pattern_instances (symbol_id, timeframe)
    WHERE status IN ('detected', 'confirmed', 'retested', 'strengthened');

CREATE INDEX idx_pattern_instances_detected_at
    ON pattern_instances (detected_at DESC);

CREATE TABLE pattern_events (
    id                   BIGSERIAL PRIMARY KEY,
    pattern_instance_id  UUID NOT NULL REFERENCES pattern_instances(id) ON DELETE CASCADE,
    event_type           TEXT NOT NULL,
    event_time           TIMESTAMPTZ NOT NULL,
    candle_time          BIGINT NOT NULL,
    price_at_event       DOUBLE PRECISION NOT NULL,
    metadata             JSONB,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_pattern_events_type
        CHECK (event_type IN (
            'detected', 'confirmed', 'retested', 'strengthened',
            'succeeded', 'failed', 'expired'
        ))
);

CREATE UNIQUE INDEX uq_pattern_events_instance_stage
    ON pattern_events (pattern_instance_id, event_type);

CREATE INDEX idx_pattern_events_instance_time
    ON pattern_events (pattern_instance_id, candle_time);

CREATE TABLE pattern_outcomes (
    pattern_instance_id   UUID PRIMARY KEY REFERENCES pattern_instances(id) ON DELETE CASCADE,
    final_outcome         TEXT NOT NULL,
    duration_candles      INT NOT NULL DEFAULT 0,
    duration_seconds      BIGINT NOT NULL DEFAULT 0,
    max_favorable_r       DOUBLE PRECISION,
    max_adverse_r         DOUBLE PRECISION,
    max_favorable_price   DOUBLE PRECISION,
    max_adverse_price     DOUBLE PRECISION,
    move_r                DOUBLE PRECISION,
    end_price             DOUBLE PRECISION,
    reason                TEXT,
    closed_at             TIMESTAMPTZ NOT NULL,
    CONSTRAINT chk_pattern_outcomes_final
        CHECK (final_outcome IN ('succeeded', 'failed', 'expired'))
);

CREATE TABLE pattern_statistics (
    symbol_id                TEXT NOT NULL REFERENCES watchlist_symbols(symbol_id),
    pattern_type             TEXT NOT NULL,
    timeframe                TEXT NOT NULL,
    sample_size              INT NOT NULL DEFAULT 0,
    success_count            INT NOT NULL DEFAULT 0,
    fail_count               INT NOT NULL DEFAULT 0,
    expired_count            INT NOT NULL DEFAULT 0,
    success_rate             DOUBLE PRECISION NOT NULL DEFAULT 0,
    resolved_success_rate    DOUBLE PRECISION,
    avg_move_r               DOUBLE PRECISION NOT NULL DEFAULT 0,
    avg_duration_candles     DOUBLE PRECISION NOT NULL DEFAULT 0,
    avg_mfe_r                DOUBLE PRECISION NOT NULL DEFAULT 0,
    avg_mae_r                DOUBLE PRECISION NOT NULL DEFAULT 0,
    move_sample_size         INT NOT NULL DEFAULT 0,
    mfe_sample_size          INT NOT NULL DEFAULT 0,
    mae_sample_size          INT NOT NULL DEFAULT 0,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (symbol_id, pattern_type, timeframe)
);

CREATE INDEX idx_pattern_statistics_updated
    ON pattern_statistics (updated_at DESC);
