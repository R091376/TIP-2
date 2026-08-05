-- Planned rails aggregates: avg risk/reward in ATR units and planned R:R (reward/risk).
-- Sample size may be lower than sample_size (excludes consolidation, invalid rails, suppress).

ALTER TABLE pattern_statistics
    ADD COLUMN avg_planned_rr DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE pattern_statistics
    ADD COLUMN avg_risk_r DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE pattern_statistics
    ADD COLUMN avg_reward_r DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE pattern_statistics
    ADD COLUMN planned_rr_sample_size INT NOT NULL DEFAULT 0;
