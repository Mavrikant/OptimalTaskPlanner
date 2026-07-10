"""Working-calendar helpers: slot arithmetic, work masks and public holidays."""

from __future__ import annotations

import re
from datetime import datetime, timedelta

import holidays as holidays_lib

from .models import SLOT_MINUTES, SLOTS_PER_DAY, WorkCalendar


def horizon_start(now: datetime) -> datetime:
    """Midnight of the day the rolling horizon starts on."""
    return datetime(now.year, now.month, now.day)


def first_free_slot(now: datetime) -> int:
    """Index of the first 30-minute slot tasks may still start in (partial slot skipped)."""
    slot = now.hour * 2 + now.minute // SLOT_MINUTES
    if now.minute % SLOT_MINUTES or now.second:
        slot += 1
    return slot


def build_work_mask(start: datetime, days: int, cal: WorkCalendar) -> list[bool]:
    """True for slots inside working hours on working days.

    Weekends (Sat/Sun) and dates listed in ``cal.holidays`` are fully off.
    """
    mask = [False] * (days * SLOTS_PER_DAY)
    holidays_set = set(cal.holidays)
    ws, we = cal.work_start_slot, cal.work_end_slot
    for d in range(days):
        day = start + timedelta(days=d)
        if day.weekday() >= 5 or day.date().isoformat() in holidays_set:
            continue
        base = d * SLOTS_PER_DAY
        for s in range(ws, we):
            mask[base + s] = True
    return mask


def supported_countries() -> list[dict[str, str]]:
    """``[{code, name}]`` for every country the `holidays` package supports."""
    entries: list[dict[str, str]] = []
    try:
        from holidays import registry

        for entity in registry.COUNTRIES.values():
            class_name, code = entity[0], entity[1]
            name = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", class_name)
            entries.append({"code": code, "name": name})
    except Exception:  # registry layout changed — fall back to bare codes
        entries = [{"code": c, "name": c} for c in holidays_lib.list_supported_countries()]
    return sorted(entries, key=lambda e: e["name"])


def country_holidays(country: str, years: list[int]) -> list[dict[str, str]]:
    """Public holidays for a country, ``[{date, name}]`` sorted by date.

    Raises ``NotImplementedError`` for unsupported country codes.
    """
    found = holidays_lib.country_holidays(country, years=years)
    return [{"date": d.isoformat(), "name": name} for d, name in sorted(found.items())]
