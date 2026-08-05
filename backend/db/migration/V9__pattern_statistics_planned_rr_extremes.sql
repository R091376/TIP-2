-- Per-trade planned R:R distribution (secondary stats): min / max / median.
-- Distinct from avg_planned_rr which is ratio of averages (avg_reward_r / avg_risk_r).

ALTER TABLE pattern_statistics
    ADD COLUMN min_planned_rr DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE pattern_statistics
    ADD COLUMN max_planned_rr DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE pattern_statistics
    ADD COLUMN median_planned_rr DOUBLE PRECISION NOT NULL DEFAULT 0;
