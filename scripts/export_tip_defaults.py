#!/usr/bin/env python3
"""Export or check TIP detector defaults vs frontend tipDefaults snapshot.

Usage (from repo root, with backend deps / PYTHONPATH=backend):
  python scripts/export_tip_defaults.py --dump
  python scripts/export_tip_defaults.py --check

--check loads frontend/src/learn/tipDefaults.json (shared with FE tipDefaults.ts)
and asserts every key matches live Settings / indicator DEFAULT_PERIOD values.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
TIP_DEFAULTS_JSON = ROOT / "frontend" / "src" / "learn" / "tipDefaults.json"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


def serialize_tip_default(v) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int) and not isinstance(v, bool):
        return str(v)
    if isinstance(v, float):
        if v.is_integer():
            return str(int(v))
        return str(v)
    if isinstance(v, str):
        return v
    raise TypeError(type(v))


def settings_projection() -> dict:
    from app.config import get_settings
    from app.indicators.atr import AtrIndicator
    from app.indicators.donchian import DonchianIndicator
    from app.indicators.volume_sma import VolumeSmaIndicator

    s = get_settings()
    return {
        "atr_period": s.atr_period,
        "breakout": dict(s.breakout),
        "breakdown": dict(s.breakdown),
        "pinbar": dict(s.pinbar),
        "engulfing": dict(s.engulfing),
        "inside_bar": dict(s.inside_bar),
        "structure": dict(s.structure),
        "consolidation": dict(s.consolidation),
        "volume_breakout": dict(s.volume_breakout),
        "indicators": {
            "atr": {"period": int(s.atr_period)},
            "donchian": {"period": DonchianIndicator.DEFAULT_PERIOD},
            "volume_sma": {"period": VolumeSmaIndicator.DEFAULT_PERIOD},
        },
        # FE chart constant must match backend volume SMA default
        "VOLUME_SMA_PERIOD": VolumeSmaIndicator.DEFAULT_PERIOD,
        # Sanity: atr indicator period tracked via atr_period above; keep AtrIndicator in lockstep
        "_atr_indicator_default": AtrIndicator.DEFAULT_PERIOD,
    }


def load_fe_tip_defaults() -> dict:
    if not TIP_DEFAULTS_JSON.is_file():
        raise FileNotFoundError(
            f"Missing FE snapshot: {TIP_DEFAULTS_JSON} "
            "(frontend/src/learn/tipDefaults.ts imports this file)"
        )
    with TIP_DEFAULTS_JSON.open(encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise TypeError("tipDefaults.json must be a JSON object")
    return data


def flatten(prefix: str, obj, out: dict[str, object]) -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if str(k).startswith("_"):
                continue  # internal projection-only keys
            key = f"{prefix}.{k}" if prefix else str(k)
            if isinstance(v, dict):
                flatten(key, v, out)
            else:
                out[key] = v
    else:
        out[prefix] = obj


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--dump", action="store_true", help="Print Settings projection as JSON")
    p.add_argument(
        "--check",
        action="store_true",
        help="Verify frontend tipDefaults.json matches live Settings / indicator defaults",
    )
    args = p.parse_args()
    if not args.dump and not args.check:
        p.print_help()
        return 2

    proj = settings_projection()
    if args.dump:
        # Drop internal keys from dump
        public = {k: v for k, v in proj.items() if not str(k).startswith("_")}
        print(json.dumps(public, indent=2, sort_keys=True))
        return 0

    try:
        fe = load_fe_tip_defaults()
    except Exception as e:
        print(f"tipDefaults check FAILED: cannot load FE snapshot: {e}", file=sys.stderr)
        return 1

    # atr indicator default must match Settings.atr_period
    if proj.get("_atr_indicator_default") != proj.get("atr_period"):
        print(
            "tipDefaults check FAILED: AtrIndicator.DEFAULT_PERIOD "
            f"({proj.get('_atr_indicator_default')}) != Settings.atr_period ({proj.get('atr_period')})",
            file=sys.stderr,
        )
        return 1

    flat_fe: dict[str, object] = {}
    flat_live: dict[str, object] = {}
    flatten("", fe, flat_fe)
    flatten("", proj, flat_live)

    errors: list[str] = []

    # Every FE key must exist on live projection and match serialized value
    for k, v in flat_fe.items():
        if k not in flat_live:
            errors.append(f"FE key not in Settings projection: {k}")
            continue
        if serialize_tip_default(flat_live[k]) != serialize_tip_default(v):
            errors.append(
                f"{k}: live={serialize_tip_default(flat_live[k])} "
                f"fe={serialize_tip_default(v)}"
            )

    # Every live public key must appear in FE (full detector projection)
    for k in flat_live:
        if k not in flat_fe:
            errors.append(f"Settings projection key missing from FE tipDefaults.json: {k}")

    if errors:
        print("tipDefaults check FAILED:", file=sys.stderr)
        for e in errors:
            print(" ", e, file=sys.stderr)
        return 1
    print("tipDefaults check OK (%d keys vs %s)" % (len(flat_fe), TIP_DEFAULTS_JSON.as_posix()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
