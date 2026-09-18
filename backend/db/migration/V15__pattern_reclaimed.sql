-- Reclaim stage after a retest (close back through detect entry).
ALTER TABLE pattern_instances
    ADD COLUMN IF NOT EXISTS flag_reclaimed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE pattern_instances
    DROP CONSTRAINT IF EXISTS chk_pattern_instances_status;

ALTER TABLE pattern_instances
    ADD CONSTRAINT chk_pattern_instances_status
        CHECK (status IN (
            'detected', 'confirmed', 'retested', 'reclaimed', 'strengthened',
            'succeeded', 'failed', 'expired'
        ));

ALTER TABLE pattern_events
    DROP CONSTRAINT IF EXISTS chk_pattern_events_type;

ALTER TABLE pattern_events
    ADD CONSTRAINT chk_pattern_events_type
        CHECK (event_type IN (
            'detected', 'confirmed', 'retested', 'reclaimed', 'strengthened',
            'succeeded', 'failed', 'expired'
        ));

DROP INDEX IF EXISTS idx_pattern_instances_open;

CREATE INDEX idx_pattern_instances_open
    ON pattern_instances (symbol_id, timeframe)
    WHERE status IN ('detected', 'confirmed', 'retested', 'reclaimed', 'strengthened');
