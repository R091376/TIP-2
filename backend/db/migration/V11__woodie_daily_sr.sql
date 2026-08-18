-- Daily Woodie ladder (woodie_open_v1) + frozen detect-time S/R stamps.
-- Dashboard pattern_statistics is intentionally untouched.
-- No named-order bins (invert on large-gap days).

CREATE TABLE daily_sr_levels (
    symbol_id               TEXT NOT NULL REFERENCES watchlist_symbols(symbol_id),
    session_date            DATE NOT NULL,
    method                  TEXT NOT NULL,
    prev_high               DOUBLE PRECISION NOT NULL,
    prev_low                DOUBLE PRECISION NOT NULL,
    prev_close              DOUBLE PRECISION NOT NULL,
    prev_open               DOUBLE PRECISION,
    today_open              DOUBLE PRECISION NOT NULL,
    range                   DOUBLE PRECISION NOT NULL,
    prev_candle_time        BIGINT NOT NULL,
    today_open_candle_time  BIGINT,
    pp                      DOUBLE PRECISION NOT NULL,
    r1                      DOUBLE PRECISION NOT NULL,
    s1                      DOUBLE PRECISION NOT NULL,
    r2                      DOUBLE PRECISION NOT NULL,
    s2                      DOUBLE PRECISION NOT NULL,
    r3                      DOUBLE PRECISION NOT NULL,
    s3                      DOUBLE PRECISION NOT NULL,
    r4                      DOUBLE PRECISION NOT NULL,
    s4                      DOUBLE PRECISION NOT NULL,
    gap                     DOUBLE PRECISION NOT NULL,
    gap_pct                 DOUBLE PRECISION,
    frozen_at               TIMESTAMPTZ NOT NULL,
    freeze_source           TEXT NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (symbol_id, session_date, method),
    CONSTRAINT chk_daily_sr_method
        CHECK (method IN ('woodie_open_v1')),
    CONSTRAINT chk_daily_sr_freeze_source
        CHECK (freeze_source IN (
            'first_rth_tick', 'mid_session_recover', 'backfill'
        )),
    CONSTRAINT chk_daily_sr_range
        CHECK (range >= 0)
);

CREATE INDEX idx_daily_sr_session
    ON daily_sr_levels (session_date DESC);

CREATE INDEX idx_daily_sr_symbol_session
    ON daily_sr_levels (symbol_id, session_date DESC);

ALTER TABLE pattern_instances
    ADD COLUMN sr_method         TEXT,
    ADD COLUMN sr_session_date   DATE,
    ADD COLUMN sr_nearest        TEXT,
    ADD COLUMN sr_near           BOOLEAN,
    ADD COLUMN sr_distance_atr   DOUBLE PRECISION,
    ADD COLUMN sr_cross          TEXT,
    ADD COLUMN sr_confluence     BOOLEAN,
    ADD COLUMN sr_break          BOOLEAN,
    ADD COLUMN sr_open_through   TEXT,
    ADD COLUMN sr_gap_dir        TEXT,
    ADD COLUMN sr_ladder_json    JSONB;

ALTER TABLE pattern_instances
    ADD CONSTRAINT chk_pi_sr_method
        CHECK (sr_method IS NULL OR sr_method IN ('woodie_open_v1'));

ALTER TABLE pattern_instances
    ADD CONSTRAINT chk_pi_sr_nearest
        CHECK (sr_nearest IS NULL OR sr_nearest IN (
            's3', 's2', 's1', 'pp', 'r1', 'r2', 'r3'
        ));

ALTER TABLE pattern_instances
    ADD CONSTRAINT chk_pi_sr_cross
        CHECK (sr_cross IS NULL OR sr_cross IN (
            'none',
            's3_up', 's3_down', 's2_up', 's2_down',
            's1_up', 's1_down', 'pp_up', 'pp_down',
            'r1_up', 'r1_down', 'r2_up', 'r2_down',
            'r3_up', 'r3_down'
        ));

ALTER TABLE pattern_instances
    ADD CONSTRAINT chk_pi_sr_gap_dir
        CHECK (sr_gap_dir IS NULL OR sr_gap_dir IN ('up', 'down', 'flat'));

ALTER TABLE pattern_instances
    ADD CONSTRAINT chk_pi_sr_distance
        CHECK (sr_distance_atr IS NULL OR sr_distance_atr >= 0);

-- Composite invariant: unstamped = all NULL; stamped requires the core set.
-- sr_cross / sr_break may stay NULL when the signal bar was missing.
ALTER TABLE pattern_instances
    ADD CONSTRAINT chk_pi_sr_stamp_invariant
        CHECK (
            (
                sr_method IS NULL
                AND sr_session_date IS NULL
                AND sr_nearest IS NULL
                AND sr_near IS NULL
                AND sr_distance_atr IS NULL
                AND sr_cross IS NULL
                AND sr_confluence IS NULL
                AND sr_break IS NULL
                AND sr_open_through IS NULL
                AND sr_gap_dir IS NULL
                AND sr_ladder_json IS NULL
            )
            OR (
                sr_method IS NOT NULL
                AND sr_session_date IS NOT NULL
                AND sr_nearest IS NOT NULL
                AND sr_near IS NOT NULL
                AND sr_distance_atr IS NOT NULL
                AND sr_confluence IS NOT NULL
                AND sr_open_through IS NOT NULL
                AND sr_gap_dir IS NOT NULL
                AND sr_ladder_json IS NOT NULL
            )
        );

CREATE INDEX idx_pi_sr_nearest
    ON pattern_instances (sr_nearest)
    WHERE sr_nearest IS NOT NULL;

CREATE INDEX idx_pi_sr_cross
    ON pattern_instances (sr_cross)
    WHERE sr_cross IS NOT NULL;

CREATE INDEX idx_pi_sr_open_through
    ON pattern_instances (sr_open_through)
    WHERE sr_open_through IS NOT NULL;

CREATE INDEX idx_pi_sr_session
    ON pattern_instances (sr_session_date)
    WHERE sr_session_date IS NOT NULL;
