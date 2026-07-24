# TIP-2 cutover validation checklist

Copy of gates from `MIGRATION.md` §6–§7 for live tracking during implementation.  
Check boxes only after evidence (CI log or manual note).

## A. Automated (Python)

- [ ] T01–T04 config / app load
- [ ] T10–T22 market / candles / feed
- [ ] T30–T31 indicators
- [ ] T40–T46 instrument / watchlist / users
- [ ] T50–T68 patterns
- [ ] T70–T76 HTTP / WS API
- [ ] `pytest -q` all green
- [ ] Frontend `npm test` green
- [ ] Frontend `npm run build` green

## B. Manual smoke

- [ ] M01 health
- [ ] M02 Vite proxy / CORS
- [ ] M03 login JWT (Bearer + localStorage)
- [ ] M04 logout (clears client token)

- [ ] M05 non-admin watchlist 403
- [ ] M06 watchlist list
- [ ] M07 chart candles
- [ ] M08 WS live updates
- [ ] M09 timeframe switch
- [ ] M10 NIFTY indexFF live

## C. Watchlist / data / patterns / admin

- [ ] M20–M26 watchlist lifecycle
- [ ] M30–M34 market data correctness
- [ ] M40–M44 patterns / journal
- [ ] M50–M51 admin / cash

## D. Cutover

- [ ] Dual-run compared to Java TIP (optional)
- [ ] One full market session on Python
- [ ] Rollback path verified (start Java, stop Python)
- [ ] Owner sign-off in MIGRATION.md §10
