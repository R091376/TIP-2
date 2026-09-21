"""POST /api/paper/charges/preview — read-only estimate, orderType required."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from app.market.models import Tick
from app.paper.cash import lock_reference_price
from app.paper.charges import NSE_EQ_CASH_V1, ChargeContext, compute_charges
from app.paper.models import Intent, LotSide, LotStatus, OrderType, PositionLot, Product, Side
from app.user.service import money

KEY = "NSE_EQ|RELIANCE"
MEMORY_UID = UUID("00000000-0000-0000-0000-000000000001")
PREVIEW = "/api/paper/charges/preview"


def _svc(client):
    return client.app.state.container.paper_service


def _enable_charges(client) -> None:
    _svc(client)._settings.paper_charges_enabled = True


def _set_ltp(client, price: float, key: str = KEY) -> None:
    _svc(client).last_price.update(
        Tick(instrument_key=key, price=price, volume_traded_today=1, timestamp_ms=1)
    )


def _money_json(v) -> Decimal:
    return money(str(v))


def _charges(intent: Intent, qty: int, price: Decimal, *, enabled: bool, side: Side, product=Product.MIS):
    px = Decimal(str(price))
    return compute_charges(
        ChargeContext(
            side=side,
            product=product,
            intent=intent,
            qty=qty,
            price=px,
            notional=money(Decimal(qty) * px),
        ),
        NSE_EQ_CASH_V1,
        enabled=enabled,
    )


def _open_long_body(**extra):
    body = {
        "instrumentKey": KEY,
        "side": "BUY",
        "orderType": "LIMIT",
        "product": "MIS",
        "qty": 10,
        "price": 100,
    }
    body.update(extra)
    return body


def test_preview_flag_off_zeros_and_no_cash_movement(client):
    _set_ltp(client, 100.0)
    before = client.get("/api/paper/account").json()
    r = client.post(PREVIEW, json=_open_long_body())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["enabled"] is False
    assert body["scheduleId"] == "off"
    assert body["charges"] == []
    assert _money_json(body["chargesTotal"]) == money("0")
    assert _money_json(body["notional"]) == money("1000")
    assert _money_json(body["cashEffect"]) == money("-1000")
    assert _money_json(body["lockEstimate"]) == money("1000")
    assert body["lockIncludesCharges"] is False
    after = client.get("/api/paper/account").json()
    assert after == before
    assert client.get("/api/paper/orders").json() == []
    assert client.get("/api/paper/ledger").json() == []
    assert client.get("/api/paper/fills").json() == []


def test_preview_open_long_mis_10_at_100_total_0_42(client):
    _enable_charges(client)
    r = client.post(PREVIEW, json=_open_long_body())
    assert r.status_code == 200, r.text
    body = r.json()
    bd = _charges(Intent.OPEN_LONG, 10, Decimal("100"), enabled=True, side=Side.BUY)
    assert bd.total == money("0.42")
    assert body["enabled"] is True
    assert body["scheduleId"] == "nse_eq_cash_v1"
    assert _money_json(body["notional"]) == money("1000")
    assert _money_json(body["chargesTotal"]) == bd.total
    assert _money_json(body["cashEffect"]) == money(-(money("1000") + bd.total))
    lock_px = lock_reference_price(OrderType.LIMIT, Decimal("100"), None, Decimal("1.02"))
    lock_bd = _charges(Intent.OPEN_LONG, 10, lock_px, enabled=True, side=Side.BUY)
    assert _money_json(body["lockEstimate"]) == money(money(Decimal(10) * lock_px) + lock_bd.total)
    assert _money_json(body["lockPrice"]) == money(lock_px)
    assert body["lockIncludesCharges"] is False
    codes = {ln["code"] for ln in body["charges"]}
    assert "BROKERAGE" in codes
    assert "STT" not in codes
    assert "SEBI" not in codes
    before = client.get("/api/paper/account").json()
    client.post(PREVIEW, json=_open_long_body())
    assert client.get("/api/paper/account").json() == before


def test_preview_market_uses_ltp_for_charges_and_haircut_lock(client):
    _enable_charges(client)
    _set_ltp(client, 100.0)
    r = client.post(
        PREVIEW,
        json={
            "instrumentKey": KEY,
            "side": "BUY",
            "orderType": "MARKET",
            "product": "MIS",
            "qty": 10,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    bd = _charges(Intent.OPEN_LONG, 10, Decimal("100"), enabled=True, side=Side.BUY)
    assert _money_json(body["chargesTotal"]) == bd.total == money("0.42")
    haircut = Decimal(str(_svc(client)._settings.paper_market_lock_haircut))
    lock_px = lock_reference_price(OrderType.MARKET, None, Decimal("100"), haircut)
    lock_bd = _charges(Intent.OPEN_LONG, 10, lock_px, enabled=True, side=Side.BUY)
    assert _money_json(body["lockPrice"]) == money(lock_px)
    assert _money_json(body["lockEstimate"]) == money(money(Decimal(10) * lock_px) + lock_bd.total)
    assert body["lockIncludesCharges"] is False


def test_preview_market_body_price_for_charges_lock_still_ltp(client):
    _enable_charges(client)
    _set_ltp(client, 100.0)
    r = client.post(
        PREVIEW,
        json={
            "instrumentKey": KEY,
            "side": "BUY",
            "orderType": "MARKET",
            "product": "MIS",
            "qty": 10,
            "price": 100.5,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    bd = _charges(Intent.OPEN_LONG, 10, Decimal("100.5"), enabled=True, side=Side.BUY)
    assert _money_json(body["notional"]) == money("1005")
    assert _money_json(body["chargesTotal"]) == bd.total
    haircut = Decimal(str(_svc(client)._settings.paper_market_lock_haircut))
    lock_px = lock_reference_price(OrderType.MARKET, Decimal("100.5"), Decimal("100"), haircut)
    lock_bd = _charges(Intent.OPEN_LONG, 10, lock_px, enabled=True, side=Side.BUY)
    assert _money_json(body["lockEstimate"]) == money(money(Decimal(10) * lock_px) + lock_bd.total)


def test_preview_market_no_ltp_400(client):
    r = client.post(
        PREVIEW,
        json={
            "instrumentKey": KEY,
            "side": "BUY",
            "orderType": "MARKET",
            "product": "MIS",
            "qty": 10,
        },
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"]["code"] == "NO_LTP"


def test_preview_sl_m_no_ltp_400(client):
    r = client.post(
        PREVIEW,
        json={
            "instrumentKey": KEY,
            "side": "BUY",
            "orderType": "SL_M",
            "product": "MIS",
            "qty": 10,
        },
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"]["code"] == "NO_LTP"


def test_preview_market_body_price_without_ltp_400(client):
    r = client.post(
        PREVIEW,
        json={
            "instrumentKey": KEY,
            "side": "BUY",
            "orderType": "MARKET",
            "product": "MIS",
            "qty": 10,
            "price": 100.5,
        },
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"]["code"] == "NO_LTP"


def test_preview_sl_m_body_price_without_ltp_400(client):
    r = client.post(
        PREVIEW,
        json={
            "instrumentKey": KEY,
            "side": "BUY",
            "orderType": "SL_M",
            "product": "MIS",
            "qty": 10,
            "price": 100.5,
        },
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"]["code"] == "NO_LTP"


def test_preview_limit_missing_price_400(client):
    r = client.post(
        PREVIEW,
        json={
            "instrumentKey": KEY,
            "side": "BUY",
            "orderType": "LIMIT",
            "product": "MIS",
            "qty": 10,
        },
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"]["code"] == "INVALID_PRICES"


def test_preview_sl_missing_price_400(client):
    r = client.post(
        PREVIEW,
        json={
            "instrumentKey": KEY,
            "side": "BUY",
            "orderType": "SL",
            "product": "MIS",
            "qty": 10,
        },
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"]["code"] == "INVALID_PRICES"


def test_preview_order_type_required_422(client):
    r = client.post(
        PREVIEW,
        json={
            "instrumentKey": KEY,
            "side": "BUY",
            "product": "MIS",
            "qty": 10,
            "price": 100,
        },
    )
    assert r.status_code == 422


def test_preview_invalid_order_type_400(client):
    r = client.post(PREVIEW, json=_open_long_body(orderType="FOO"))
    assert r.status_code == 400, r.text
    assert r.json()["detail"]["code"] == "INVALID_ORDER_TYPE"


def test_preview_close_long_lock_zero_cash_effect_inflow(client):
    _enable_charges(client)
    lot_id = uuid4()
    _svc(client)._lots[lot_id] = PositionLot(
        id=lot_id,
        user_id=MEMORY_UID,
        instrument_key=KEY,
        trading_symbol="RELIANCE",
        side=LotSide.LONG,
        product=Product.MIS,
        qty_open=10,
        avg_entry_price=Decimal("100"),
        status=LotStatus.OPEN,
        opened_at=datetime.now(timezone.utc),
    )
    r = client.post(
        PREVIEW,
        json={
            "instrumentKey": KEY,
            "side": "SELL",
            "orderType": "LIMIT",
            "product": "MIS",
            "qty": 10,
            "price": 105,
            "closeLotId": str(lot_id),
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    bd = _charges(Intent.CLOSE_LONG, 10, Decimal("105"), enabled=True, side=Side.SELL)
    assert bd.total == money("0.67")
    assert _money_json(body["chargesTotal"]) == bd.total
    assert _money_json(body["notional"]) == money("1050")
    assert _money_json(body["cashEffect"]) == money(money("1050") - bd.total)
    assert _money_json(body["lockEstimate"]) == money("0")


def test_preview_open_short_cash_effect_is_minus_charges(client):
    _enable_charges(client)
    r = client.post(
        PREVIEW,
        json={
            "instrumentKey": KEY,
            "side": "SELL",
            "orderType": "LIMIT",
            "product": "MIS",
            "qty": 10,
            "price": 100,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    bd = _charges(Intent.OPEN_SHORT, 10, Decimal("100"), enabled=True, side=Side.SELL)
    assert _money_json(body["chargesTotal"]) == bd.total
    assert _money_json(body["cashEffect"]) == money(-bd.total)
    lock_px = lock_reference_price(OrderType.LIMIT, Decimal("100"), None, Decimal("1.02"))
    lock_bd = _charges(Intent.OPEN_SHORT, 10, lock_px, enabled=True, side=Side.SELL)
    assert _money_json(body["lockEstimate"]) == money(money(Decimal(10) * lock_px) + lock_bd.total)


def test_preview_cover_short_missing_lot_400(client):
    r = client.post(
        PREVIEW,
        json={
            "instrumentKey": KEY,
            "side": "BUY",
            "orderType": "LIMIT",
            "product": "MIS",
            "qty": 10,
            "price": 95,
            "closeLotId": str(uuid4()),
        },
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"]["code"] == "LOT_NOT_FOUND"


def test_preview_cover_short_cash_effect_pnl_minus_charges(client):
    _enable_charges(client)
    lot_id = uuid4()
    _svc(client)._lots[lot_id] = PositionLot(
        id=lot_id,
        user_id=MEMORY_UID,
        instrument_key=KEY,
        trading_symbol="RELIANCE",
        side=LotSide.SHORT,
        product=Product.MIS,
        qty_open=10,
        avg_entry_price=Decimal("100"),
        status=LotStatus.OPEN,
        opened_at=datetime.now(timezone.utc),
    )
    r = client.post(
        PREVIEW,
        json={
            "instrumentKey": KEY,
            "side": "BUY",
            "orderType": "LIMIT",
            "product": "MIS",
            "qty": 10,
            "price": 95,
            "closeLotId": str(lot_id),
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    bd = _charges(Intent.COVER_SHORT, 10, Decimal("95"), enabled=True, side=Side.BUY)
    pnl = money((Decimal("100") - Decimal("95")) * Decimal(10))
    assert _money_json(body["chargesTotal"]) == bd.total
    assert _money_json(body["cashEffect"]) == money(pnl - bd.total)
    assert _money_json(body["lockEstimate"]) == money("0")


def test_preview_does_not_require_trading_enabled(client):
    svc = _svc(client)
    # AuthUser.tradingEnabled is unused by preview; call the service with a user
    # that would be blocked on place_order.
    _set_ltp(client, 100.0)
    out = svc.preview_charges(
        MEMORY_UID,
        instrument_key=KEY,
        side="BUY",
        order_type="MARKET",
        product="MIS",
        qty=1,
    )
    assert out["enabled"] is False
    assert _money_json(out["chargesTotal"]) == money("0")
