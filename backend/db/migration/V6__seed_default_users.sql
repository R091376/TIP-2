-- Default bootstrap users (parity with local tip DB admin + test).
-- Passwords match current local hashes: admin/admin, test/test.
-- Idempotent: skips rows that already exist by username/id.

INSERT INTO app_users (
    id,
    username,
    password_hash,
    role,
    display_name,
    cash_balance,
    trading_enabled,
    active,
    created_at,
    updated_at
) VALUES
(
    '42290ca4-8804-42fe-a611-6ce46541c635',
    'admin',
    '$2b$12$NKTdWzZ0vvrNvOyenVS39uTZJiOVj6QZq2pd1JofKLtfsL4vmmB5K',
    'ADMIN',
    'Administrator',
    100000.00,
    TRUE,
    TRUE,
    TIMESTAMPTZ '2026-07-16 14:36:48.874129+05:30',
    TIMESTAMPTZ '2026-07-22 11:02:22.960390+05:30'
),
(
    '4796ecb1-8b07-4c5b-b890-b301eecf07e1',
    'test',
    '$2a$10$LPiW5zmw7qctqrmwLAXDQOb8dBWvFA..aFOynrVkh8NBlumndhZBK',
    'USER',
    'Tester',
    100000.00,
    TRUE,
    TRUE,
    TIMESTAMPTZ '2026-07-16 14:43:23.856877+05:30',
    TIMESTAMPTZ '2026-07-16 14:43:23.856877+05:30'
)
ON CONFLICT (username) DO NOTHING;

INSERT INTO cash_ledger (
    id,
    user_id,
    entry_type,
    amount,
    balance_after,
    note,
    created_at
) VALUES
(
    '8410907f-3ce2-496b-8ba6-05d07e225537',
    '42290ca4-8804-42fe-a611-6ce46541c635',
    'SEED',
    100000.00,
    100000.00,
    'Initial seed cash',
    TIMESTAMPTZ '2026-07-16 14:36:48.995197+05:30'
),
(
    'a39df422-f0be-4488-8d95-b024bfbf6911',
    '4796ecb1-8b07-4c5b-b890-b301eecf07e1',
    'SEED',
    100000.00,
    100000.00,
    'Initial seed cash',
    TIMESTAMPTZ '2026-07-16 14:43:23.973218+05:30'
)
ON CONFLICT (id) DO NOTHING;
