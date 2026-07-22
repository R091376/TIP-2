-- Pin-bar patterns (Hammer / Shooting Star) — extend journal type CHECK.

ALTER TABLE pattern_instances
    DROP CONSTRAINT IF EXISTS chk_pattern_instances_type;

ALTER TABLE pattern_instances
    ADD CONSTRAINT chk_pattern_instances_type
        CHECK (pattern_type IN (
            'breakout',
            'breakdown',
            'consolidation',
            'volume_breakout',
            'hammer',
            'shooting_star'
        ));
